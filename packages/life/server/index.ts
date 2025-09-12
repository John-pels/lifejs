import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import chalk from "chalk";
import chokidar, { type FSWatcher } from "chokidar";
import { agentClientConfig, agentServerConfig } from "@/agent/config";
import type { AgentScope } from "@/agent/server/types";
import { importServerBuild } from "@/exports/build/server";
import { ns } from "@/shared/nanoseconds";
import * as op from "@/shared/operation";
import { newId } from "@/shared/prefixed-id";
import { ProcessStats } from "@/shared/process-stats";
import type { TelemetryClient } from "@/telemetry/base";
import { createTelemetryClient } from "@/telemetry/node";
import { transportProviderGetToken } from "@/transport/auth";
import packageJson from "../package.json" with { type: "json" };
import { AgentProcess } from "./agent-process/parent";
import { LifeApi } from "./api";
import { type ServerOptions, serverOptionsSchema } from "./options";

const EXCLUDED_DEFAULTS = ["**/node_modules/**", "**/build/**", "**/generated/**", "**/dist/**"];

export class LifeServer {
  options: ServerOptions<"output">;
  telemetry: TelemetryClient;
  watcher: FSWatcher | null = null;
  api: LifeApi;
  readonly #agentProcesses = new Map<string, AgentProcess>();
  readonly #processStats = new ProcessStats();
  readonly #fileHashes = new Map<string, string>();
  #startedAt: number | null = null;

  constructor(options: ServerOptions<"input">) {
    this.options = serverOptionsSchema.parse(options);
    this.api = new LifeApi(this);

    this.telemetry = createTelemetryClient("server", {
      watch: this.options.watch,
    });
  }

  async start() {
    using h0 = (await this.telemetry.trace("start()")).start();

    try {
      h0.log.info({ message: "Starting server." });
      h0.log.debug({ message: `Project directory: ${this.options.projectDirectory}` });
      h0.log.debug({ message: `Watch: ${this.options.watch}` });
      h0.log.debug({ message: `Host: ${this.options.host}` });
      h0.log.debug({ message: `Port: ${this.options.port}` });

      // 1. Ensure a valid build directory exists
      const [errDir] = await this.ensureBuildDirectory();
      if (errDir) return op.failure(errDir);

      // 2. Start the API
      const [errApi] = await this.api.start();
      if (errApi) return op.failure(errApi);
      this.#startedAt = Date.now();

      // 3. Start watching build directory if in watch mode
      const [errWatch] = await this.watchBuildDirectory();
      if (errWatch) return op.failure(errWatch);

      // 4. Listen for SIGINT and SIGTERM to gracefully stop the server
      const handleShutdown = async (signal: string) => {
        console.log(""); // new line for readability
        this.telemetry.log.info({ message: `Received ${signal}, shutting down gracefully...` });
        await this.stop();
      };
      process.once("SIGINT", () => handleShutdown("SIGINT"));
      process.once("SIGTERM", () => handleShutdown("SIGTERM"));

      // Count the server starts
      this.telemetry.counter("server_started").increment();

      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  #stopStarted = false;
  async stop() {
    try {
      if (this.#stopStarted) return;
      this.#stopStarted = true;

      using h0 = (await this.telemetry.trace("stop()")).start();
      h0.log.info({ message: "Stopping server." });

      // Stop the API
      const [errApi] = await this.api.stop();
      if (errApi) return op.failure(errApi);

      // Stop the watcher
      await this.watcher?.close();
      this.watcher = null;

      // Stop the agent processes
      const results = await Promise.all(
        Array.from(this.#agentProcesses.values()).map((process) =>
          this.stopAgentProcess(process.id, process.sessionToken),
        ),
      );
      const err = results.find((result) => result[0])?.[0];
      if (err) return op.failure(err);

      // Ensure telemetry consumers have finished processing
      await this.telemetry.flushConsumers();

      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async ensureBuildDirectory() {
    using h0 = (await this.telemetry.trace("ensureBuildDirectory()")).start();

    try {
      // Check if project directory exists
      if (!existsSync(this.options.projectDirectory)) {
        return op.failure({
          code: "NotFound",
          message: `Provided project directory not found: ${this.options.projectDirectory}`,
        });
      }

      // Check if .life directory exists
      const buildDir = join(this.options.projectDirectory, ".life");
      if (!existsSync(buildDir)) {
        return op.failure({
          code: "NotFound",
          message: `The .life/ build directory not found at: ${buildDir}. Run 'life build' first.`,
        });
      }

      // Check if client index exists
      const clientIndex = join(buildDir, "client", "index.ts");
      if (!existsSync(clientIndex)) {
        return op.failure({
          code: "NotFound",
          message: `The .life/ build directory appears to be incomplete. Run 'life build' again.`,
        });
      }

      // Check if server dist index exists
      const serverIndex = join(buildDir, "server", "dist", "index.js");
      if (!existsSync(serverIndex)) {
        return op.failure({
          code: "NotFound",
          message: `The .life/ build directory appears to be incomplete. Run 'life build' again.`,
        });
      }

      h0.log.debug({
        message: "Valid .life/ build directory found.",
        attributes: {
          projectDirectory: this.options.projectDirectory,
          buildDirectory: buildDir,
        },
      });

      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async watchBuildDirectory() {
    using _ = (await this.telemetry.trace("watchBuildDirectory()")).start();

    try {
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
            message: `Restarted ${instanceCount} instance${instanceCount > 1 ? "s" : ""} of '${formattedName}' in ${chalk.bold(`${ns.toMs(h1.getData().duration)}ms`)}.`,
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

      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async listAvailableAgents() {
    try {
      const [errImport, build] = await op.attempt(async () => await importServerBuild(true));
      if (errImport) return op.failure(errImport);
      return op.success(
        Object.entries(build).map(([name, { definition }]) => ({
          name,
          scopeKeys: definition?.scope?.schema?.shape
            ? Object.keys(definition.scope.schema.shape)
            : [],
        })),
      );
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  listAgentProcesses() {
    try {
      return op.success(
        Array.from(this.#agentProcesses.values()).map((process) => ({
          id: process.id,
          name: process.name,
          status: process.status,
          lastStartedAt: process.lastStartedAt,
        })),
      );
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
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
    using _ = (await this.telemetry.trace("createAgentProcess()", { name, scope })).start();

    try {
      // Ensure the request agent exists
      const build = await importServerBuild(true);
      const definition = build[name as keyof typeof build]?.definition;
      if (!definition) {
        return op.failure({ code: "NotFound", message: `Agent '${name}' not found.` });
      }

      // Ensure the request emitter has access to this agent and scope
      if (!(await definition.scope.hasAccess({ request, scope }))) {
        return op.failure({ code: "Forbidden", message: `Access denied for agent '${name}'.` });
      }

      // Generate a room name for the WebRTC session
      const roomName = newId("room");

      // Generate transport tokens for both the agent and the user
      const transportProvider = definition.config.transport.provider;
      const transportGetToken =
        transportProviderGetToken[transportProvider as keyof typeof transportProviderGetToken];
      const [errAgentToken, agentToken] = await transportGetToken(
        definition.config.transport,
        roomName,
        "agent",
      );
      if (errAgentToken) return op.failure(errAgentToken);
      const [errUserToken, userToken] = await transportGetToken(
        definition.config.transport,
        roomName,
        "user",
      );
      if (errUserToken) return op.failure(errUserToken);

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
      return op.success({
        agentId: process.id,
        sessionToken,
        transportRoom: { name: roomName, token: userToken },
        // Pipe first through server config to ensure client config is a subset of server config
        clientSideConfig: agentServerConfig.schema
          .pipe(agentClientConfig.schema)
          .parse(definition.config),
      });
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async getAgentProcess(id: string, sessionToken: string) {
    using _ = (await this.telemetry.trace("getAgentProcess()", { id })).start();
    try {
      const process = this.#agentProcesses.get(id);
      if (!process) {
        return op.failure({ code: "NotFound", message: `Agent process '${id}' not found.` });
      }
      if (process.sessionToken !== sessionToken) {
        return op.failure({
          code: "Validation",
          message: `Invalid session token for agent process '${id}'.`,
        });
      }
      return op.success(process);
    } catch (error) {
      return op.failure({
        code: "Unknown",
        message: `Failed to obtain agent process '${id}'.`,
        error,
      });
    }
  }

  async startAgentProcess(id: string, sessionToken: string) {
    using h0 = (await this.telemetry.trace("startAgentProcess()", { id })).start();
    try {
      const [errGet, process] = await this.getAgentProcess(id, sessionToken);
      if (errGet) return op.failure(errGet);

      // Track timing for starting the process
      using h1 = (
        await this.telemetry.trace("start-process", { id, agentName: process.name })
      ).start();
      const [errStart] = await op.attempt(process.start);
      if (errStart) return op.failure(errStart);
      h1.end();

      // Log with timing
      const formattedName = chalk.bold.italic(process.name);
      h0.log.info({
        message: `Started instance of '${formattedName}' in ${chalk.bold(`${ns.toMs(h1.getData().duration)}ms`)}.`,
        attributes: { id, agentName: process.name },
      });

      return op.success();
    } catch (error) {
      return op.failure({
        code: "Unknown",
        message: `Failed to start agent process '${id}'.`,
        error,
      });
    }
  }

  async stopAgentProcess(id: string, sessionToken: string) {
    using h0 = (await this.telemetry.trace("stopAgentProcess()", { id })).start();
    try {
      const [errGet, process] = await this.getAgentProcess(id, sessionToken);
      if (errGet) return op.failure(errGet);

      // Track timing for stopping the process
      using h1 = (
        await this.telemetry.trace("stop-process", { id, agentName: process.name })
      ).start();

      const [errStop] = await process.stop();
      h1.end();

      if (errStop) return op.failure(errStop);

      // Log with timing
      const formattedName = chalk.bold.italic(process.name);
      h0.log.info({
        message: `Stopped instance of '${formattedName}' in ${chalk.bold(`${ns.toMs(h1.getData().duration)}ms`)}.`,
        attributes: { id, agentName: process.name },
      });

      return op.success();
    } catch (error) {
      return op.failure({
        code: "Unknown",
        message: `Failed to stop agent process '${id}'.`,
        error,
      });
    }
  }

  async restartAgentProcess(id: string, sessionToken: string) {
    using h0 = (await this.telemetry.trace("restartAgentProcess()", { id })).start();
    try {
      const [errGet, process] = await this.getAgentProcess(id, sessionToken);
      if (errGet) return op.failure(errGet);

      // Track timing for restarting the process
      using h1 = (
        await this.telemetry.trace("restart-process", { id, agentName: process.name })
      ).start();
      const [errRestart] = await process.restart();
      h1.end();

      if (errRestart) return op.failure(errRestart);

      // Log with timing
      const formattedName = chalk.bold.italic(process.name);
      h0.log.info({
        message: `Restarted instance of '${formattedName}' in ${chalk.bold(`${ns.toMs(h1.getData().duration)}ms`)}.`,
        attributes: { id, agentName: process.name },
      });

      return op.success();
    } catch (error) {
      return op.failure({
        code: "Unknown",
        message: `Failed to restart agent process '${id}'.`,
        error,
      });
    }
  }

  async getAgentProcessInfo(id: string, sessionToken: string) {
    using _ = (await this.telemetry.trace("getAgentProcessInfo()", { id })).start();
    try {
      const [errGet, process] = await this.getAgentProcess(id, sessionToken);
      if (errGet) return op.failure(errGet);
      const [errStats, stats] = await process.getProcessStats();
      if (errStats) return op.failure(errStats);
      return op.success({
        id,
        name: process.name,
        scope: process.scope,
        status: process.status,
        lastStartedAt: process.lastStartedAt,
        lastSeenAt: process.lastSeenAt,
        restartCount: process.restartCount,
        ...(stats ?? {}),
      });
    } catch (error) {
      return op.failure({
        code: "Unknown",
        message: `Failed to get info for agent process '${id}'.`,
        error,
      });
    }
  }

  async pingAgentProcess(id: string, sessionToken: string) {
    using _ = (await this.telemetry.trace("pingAgentProcess()", { id })).start();
    try {
      const [errGet, process] = await this.getAgentProcess(id, sessionToken);
      if (errGet) return op.failure(errGet);
      const [errPing] = await process.ping();
      if (errPing) return op.failure(errPing);
      return op.success("pong");
    } catch (error) {
      return op.failure({
        code: "Unknown",
        message: `Failed to ping agent process '${id}'.`,
        error,
      });
    }
  }

  async getServerInfo() {
    using _ = (await this.telemetry.trace("getServerInfo()")).start();
    try {
      const [errStats, stats] = this.#processStats.get();
      if (errStats) return op.failure(errStats);
      return op.success({
        lifeVersion: packageJson.version,
        nodeVersion: process.version,
        // biome-ignore lint/style/noNonNullAssertion: cannot be null here
        startedAt: this.#startedAt!,
        ...(stats ?? {}),
      });
    } catch (error) {
      return op.failure({ code: "Unknown", message: "Failed to get server info", error });
    }
  }
}
