import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import chalk from "chalk";
import chokidar, { type FSWatcher } from "chokidar";
import { agentConfig } from "@/agent/config";
import type { AgentScope } from "@/agent/server/types";
import { importServerBuild } from "@/exports/build/server";
import { ns } from "@/shared/nanoseconds";
import { newId } from "@/shared/prefixed-id";
import { ProcessStats } from "@/shared/process-stats";
import { lifeTelemetry } from "@/telemetry/client";
import { getToken } from "@/transport/auth";
import packageJson from "../package.json" with { type: "json" };
import { AgentProcess } from "./agent-process/parent";
import { LifeServerApi } from "./api";
import { type ServerOptions, serverOptionsSchema } from "./options";

const EXCLUDED_DEFAULTS = ["**/node_modules/**", "**/build/**", "**/generated/**", "**/dist/**"];

export class LifeServer {
  options: ServerOptions<"output">;
  telemetry = lifeTelemetry.child("server");
  watcher: FSWatcher | null = null;
  api: LifeServerApi;
  readonly #agentProcesses = new Map<string, AgentProcess>();
  readonly #processStats = new ProcessStats();
  readonly #fileHashes = new Map<string, string>();
  #startedAt: number | null = null;

  constructor(options: ServerOptions<"input">) {
    this.options = serverOptionsSchema.parse(options);
    this.api = new LifeServerApi(this);
  }

  async start() {
    // Telemetry
    using h0 = (await this.telemetry.trace("start()")).start();
    h0.log.info({ message: "Starting server." });
    h0.log.debug({ message: `Project directory: ${this.options.projectDirectory}` });
    h0.log.debug({ message: `Watch: ${this.options.watch}` });
    h0.log.debug({ message: `Host: ${this.options.host}` });
    h0.log.debug({ message: `Port: ${this.options.port}` });

    // 1. Ensure a valid build directory exists
    if (!(await this.ensureBuildDirectory())) return;

    // 2. Start the API
    await this.api.start();

    // 3. Start watching build directory if in watch mode
    if (this.options.watch) {
      await this.watchBuildDirectory();
    }

    // 4. Listen for SIGINT and SIGTERM to gracefully stop the server
    const handleShutdown = async (signal: string) => {
      console.log(""); // new line for readability
      this.telemetry.log.info({ message: `Received ${signal}, shutting down gracefully...` });
      await this.stop();
    };
    process.once("SIGINT", () => handleShutdown("SIGINT"));
    process.once("SIGTERM", () => handleShutdown("SIGTERM"));

    // Set started at
    this.#startedAt = Date.now();

    // Telemetry
    this.telemetry.counter("server_started").increment();
  }

  #stopStarted = false;
  async stop() {
    if (this.#stopStarted) return;
    this.#stopStarted = true;

    using h0 = (await this.telemetry.trace("stop()")).start();
    h0.log.info({ message: "Stopping server." });

    // Stop the API
    await this.api.stop();

    // Stop the watcher
    this.watcher?.close();
    this.watcher = null;

    // Stop the agent processes
    await Promise.all(
      Array.from(this.#agentProcesses.values()).map((process) =>
        this.stopAgentProcess(process.id, process.sessionToken),
      ),
    );

    // Ensure telemetry consumers have finished processing
    await this.telemetry.flush();
  }

  async ensureBuildDirectory(): Promise<boolean> {
    using h0 = (await this.telemetry.trace("ensureBuildDirectory()")).start();

    // Check if project directory exists
    if (!existsSync(this.options.projectDirectory)) {
      h0.log.error({
        message: `Provided project directory not found: ${this.options.projectDirectory}`,
      });
      return false;
    }

    // Check if .life directory exists
    const buildDir = join(this.options.projectDirectory, ".life");
    if (!existsSync(buildDir)) {
      h0.log.error({
        message: `The .life/ build directory not found at: ${buildDir}. Run 'life build' first.`,
      });
      return false;
    }

    // Check if client index exists
    const clientIndex = join(buildDir, "client", "index.ts");
    if (!existsSync(clientIndex)) {
      h0.log.error({
        message: `The .life/ build directory appears to be incomplete. Run 'life build' again.`,
      });
      return false;
    }

    // Check if server dist index exists
    const serverIndex = join(buildDir, "server", "dist", "index.js");
    if (!existsSync(serverIndex)) {
      h0.log.error({
        message: `The .life/ build directory appears to be incomplete. Run 'life build' again.`,
      });
      return false;
    }

    h0.log.debug({
      message: "Valid .life/ build directory found.",
      attributes: {
        projectDirectory: this.options.projectDirectory,
        buildDirectory: buildDir,
      },
    });

    return true;
  }

  async watchBuildDirectory() {
    using _ = (await this.telemetry.trace("watchBuildDirectory()")).start();

    // Get the raw server directory
    const buildDir = join(this.options.projectDirectory, ".life");
    const rawServerDir = join(buildDir, "server", "raw");

    // Initialize content hashes for existing agent files to track actual changes
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(rawServerDir).filter(
      (file) => file.endsWith(".ts") && file !== "index.ts",
    );

    // Read all files in parallel to avoid await-in-loop issue
    await Promise.all(
      files.map(async (file) => {
        const filePath = join(rawServerDir, file);
        try {
          const content = await readFile(filePath, "utf-8");
          const hash = createHash("md5").update(content).digest("hex");
          this.#fileHashes.set(filePath, hash);
        } catch (error) {
          this.telemetry.log.debug({
            message: "Failed to initialize hash for file",
            error,
            attributes: { path: filePath },
          });
        }
      }),
    );

    // Watch for changes to agent build files
    this.watcher = chokidar.watch(".", {
      cwd: rawServerDir,
      ignoreInitial: true,
      ignored: ["index.ts", ...EXCLUDED_DEFAULTS],
      awaitWriteFinish: {
        stabilityThreshold: 50,
        pollInterval: 5,
      },
    });

    const processWatchEvent = async (action: "change", relPath: string) => {
      using h0 = (await this.telemetry.trace("processWatchEvent()", { action, relPath })).start();

      try {
        const absPath = join(rawServerDir, relPath);

        // Only process change events (add/unlink ignored for now)
        if (action !== "change") return;

        // Check if file content has actually changed using hash comparison
        const content = await readFile(absPath, "utf-8");
        const newHash = createHash("md5").update(content).digest("hex");
        const oldHash = this.#fileHashes.get(absPath);
        if (oldHash === newHash) return;

        // Update stored hash
        this.#fileHashes.set(absPath, newHash);

        // Extract agent name from filename
        const agentName = basename(relPath, ".ts");

        h0.log.debug({
          message: `Detected change in agent '${agentName}', restarting affected processes.`,
          attributes: { agentName, path: absPath },
        });

        // Find all running processes for this agent
        const processesToRestart: AgentProcess[] = [];
        for (const [, process] of this.#agentProcesses) {
          if (process.name === agentName && process.status === "running") {
            processesToRestart.push(process);
          }
        }

        if (processesToRestart.length === 0) {
          h0.log.debug({
            message: `No running processes found for agent '${agentName}'.`,
            attributes: { agentName },
          });
          return;
        }

        // Restart affected processes in parallel and track timing
        using h1 = (
          await this.telemetry.trace("restart-agent-processes", {
            agentName,
            count: processesToRestart.length,
          })
        ).start();

        await Promise.all(
          processesToRestart.map(async (process) => {
            h0.log.debug({
              message: `Restarting process '${process.id}' for agent '${agentName}'.`,
              attributes: { processId: process.id, agentName },
            });
            await process.restart();
          }),
        );

        h1.end();

        // Log with timing similar to compiler
        const instanceCount = processesToRestart.length;
        const formattedName = chalk.bold.italic(agentName);
        h0.log.info({
          message: `Restarted ${instanceCount} instance${instanceCount > 1 ? "s" : ""} of '${formattedName}' in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
          attributes: { agentName, instanceCount },
        });
      } catch (error) {
        h0.log.error({
          message: "Failed to process watch event",
          error,
          attributes: { path: relPath },
        });
      }
    };

    // Listen for file changes
    this.watcher.on("change", (relPath) => processWatchEvent("change", relPath));
  }

  async listAvailableAgents() {
    const build = await importServerBuild(true);
    return Object.entries(build).map(([name, { definition }]) => ({
      name,
      scopeKeys: definition?.scope?.schema?.shape ? Object.keys(definition.scope.schema.shape) : [],
    }));
  }

  listAgentProcesses() {
    return {
      success: true,
      processes: Array.from(this.#agentProcesses.values()).map((process) => ({
        id: process.id,
        name: process.name,
        status: process.status,
        lastStartedAt: process.lastStartedAt,
      })),
    };
  }

  async createAgentProcess({
    name,
    scope,
    request,
  }: {
    name: string;
    scope: AgentScope;
    request: Request;
  }) {
    using h0 = (await this.telemetry.trace("createAgentProcess()", { name, scope })).start();

    try {
      // Ensure the request agent exists
      const build = await importServerBuild(true);
      const definition = build[name as keyof typeof build]?.definition;
      if (!definition) {
        const message = `Definition not found for agent '${name}'.`;
        h0.log.error({ message });
        return { success: false, message };
      }

      // Ensure the request emitter has access to this agent and scope
      if (!(await definition.scope.hasAccess({ request, scope }))) {
        const message = `Access denied for agent '${name}'.`;
        h0.log.error({ message });
        return { success: false, message };
      }

      // Generate a room name for the WebRTC session
      const roomName = newId("room");

      // Generate transport tokens for both the agent and the user
      const transportProvider = definition.config.transport.provider;
      const agentToken = await getToken(
        transportProvider,
        definition.config.transport,
        roomName,
        "agent",
      );
      const userToken = await getToken(
        transportProvider,
        definition.config.transport,
        roomName,
        "user",
      );

      // Generate a session token to authenticate the user client when talking to the agent
      const sessionToken = randomBytes(32).toString("base64url");

      // Create the agent process
      const process = new AgentProcess({
        name,
        scope,
        server: this,
        transportRoom: { name: roomName, token: agentToken },
        sessionToken,
      });

      // Add the agent process to the map
      this.#agentProcesses.set(process.id, process);

      // Return infos for the user client to connect to the agent
      return {
        success: true,
        agentId: process.id,
        sessionToken,
        transportRoom: { name: roomName, token: userToken },
        clientSideConfig: agentConfig.clientSchema.parse(definition.config),
      };
    } catch (error) {
      const message = `Failed to create agent process: ${name}`;
      h0.log.error({ message, error });
      return { success: false, message };
    }
  }

  async getAgentProcess(id: string, sessionToken: string) {
    using h0 = (await this.telemetry.trace("getAgentProcess()", { id })).start();
    try {
      const process = this.#agentProcesses.get(id);
      if (!process) {
        const message = `Agent process not found: ${id}`;
        h0.log.error({ message });
        return { success: false, message };
      }
      if (process.sessionToken !== sessionToken) {
        const message = `Invalid session token for agent process: ${id}`;
        h0.log.error({ message });
        return { success: false, message };
      }
      return { success: true, process };
    } catch (error) {
      const message = `Failed to get agent process: ${id}`;
      h0.log.error({ message, error });
      return { success: false, message };
    }
  }

  async startAgentProcess(id: string, sessionToken: string) {
    using h0 = (await this.telemetry.trace("startAgentProcess()", { id })).start();
    try {
      const processResult = await this.getAgentProcess(id, sessionToken);
      const process = processResult.process;
      if (!(process && processResult.success)) return processResult;

      // Track timing for starting the process
      using h1 = (
        await this.telemetry.trace("start-process", { id, agentName: process.name })
      ).start();

      const startResult = await process.start();
      h1.end();

      if (!startResult.success) return startResult;

      // Log with timing
      const formattedName = chalk.bold.italic(process.name);
      h0.log.info({
        message: `Started instance of '${formattedName}' in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
        attributes: { id, agentName: process.name },
      });

      return { success: true };
    } catch (error) {
      const message = `Failed to start agent process: ${id}`;
      h0.log.error({ message, error });
      return { success: false, message };
    }
  }

  async stopAgentProcess(id: string, sessionToken: string) {
    using h0 = (await this.telemetry.trace("stopAgentProcess()", { id })).start();
    try {
      const processResult = await this.getAgentProcess(id, sessionToken);
      const process = processResult.process;
      if (!(process && processResult.success)) return processResult;

      // Track timing for stopping the process
      using h1 = (
        await this.telemetry.trace("stop-process", { id, agentName: process.name })
      ).start();

      const stopResult = await process.stop();
      h1.end();

      if (!stopResult.success) return stopResult;

      // Log with timing
      const formattedName = chalk.bold.italic(process.name);
      h0.log.info({
        message: `Stopped instance of '${formattedName}' in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
        attributes: { id, agentName: process.name },
      });

      return { success: true };
    } catch (error) {
      const message = `Failed to stop agent process: ${id}`;
      h0.log.error({ message, error });
      return { success: false, message };
    }
  }

  async restartAgentProcess(id: string, sessionToken: string) {
    using h0 = (await this.telemetry.trace("restartAgentProcess()", { id })).start();
    try {
      const processResult = await this.getAgentProcess(id, sessionToken);
      const process = processResult.process;
      if (!(process && processResult.success)) return processResult;

      // Track timing for restarting the process
      using h1 = (
        await this.telemetry.trace("restart-process", { id, agentName: process.name })
      ).start();
      const restartResult = await process.restart();
      h1.end();

      if (!restartResult.success) return restartResult;

      // Log with timing
      const formattedName = chalk.bold.italic(process.name);
      h0.log.info({
        message: `Restarted instance of '${formattedName}' in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
        attributes: { id, agentName: process.name },
      });

      return true;
    } catch (error) {
      const message = `Failed to restart agent process: ${id}`;
      h0.log.error({ message, error });
      return { success: false, message };
    }
  }

  async getAgentProcessInfo(id: string, sessionToken: string) {
    using h0 = (await this.telemetry.trace("getAgentProcessInfo()", { id })).start();
    try {
      const processResult = await this.getAgentProcess(id, sessionToken);
      const process = processResult.process;
      if (!(process && processResult.success)) return processResult;
      const statsResult = await process.getProcessStats();
      return {
        success: true,
        info: {
          id,
          name: process.name,
          scope: process.scope,
          status: process.status,
          lastStartedAt: process.lastStartedAt,
          lastSeenAt: process.lastSeenAt,
          restartCount: process.restartCount,
          stats: statsResult.stats,
        },
      };
    } catch (error) {
      const message = `Failed to get agent process info: ${id}`;
      h0.log.error({ message, error });
      return { success: false, message };
    }
  }

  async getServerInfo() {
    using h0 = (await this.telemetry.trace("getServerInfo()")).start();
    try {
      const stats = this.#processStats.get();
      return {
        success: true,
        info: {
          lifeVersion: packageJson.version,
          nodeVersion: process.version,
          startedAt: this.#startedAt,
          ...stats,
        },
      };
    } catch (error) {
      const message = "Failed to get server info";
      h0.log.error({ message, error });
      return { success: false, message };
    }
  }
}
