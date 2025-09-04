import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { FSWatcher } from "chokidar";
import { agentConfig } from "@/agent/config";
import type { AgentScope } from "@/agent/server/types";
import { importServerBuild } from "@/exports/build/server";
import { newId } from "@/shared/prefixed-id";
import { ProcessStats } from "@/shared/process-stats";
import { lifeTelemetry } from "@/telemetry/client";
import { getToken } from "@/transport/auth";
import packageJson from "../package.json" with { type: "json" };
import { AgentProcess } from "./agent-process/parent";
import { LifeServerApi } from "./api";
import { type ServerOptions, serverOptionsSchema } from "./options";

// const EXCLUDED_DEFAULTS = ["**/node_modules/**", "**/build/**", "**/generated/**", "**/dist/**"];

export class LifeServer {
  options: ServerOptions<"output">;
  telemetry = lifeTelemetry.child("server");
  watcher: FSWatcher | null = null;
  api: LifeServerApi;
  readonly #agentProcesses = new Map<string, AgentProcess>();
  readonly #processStats = new ProcessStats();
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

    // 3. Listen for SIGINT and SIGTERM to gracefully stop the server
    const handleShutdown = async (signal: string) => {
      console.log(""); // new line for readability
      this.telemetry.log.info({ message: `Received ${signal}, shutting down gracefully...` });
      await this.stop();
    };
    process.once("SIGINT", () => handleShutdown("SIGINT"));
    process.once("SIGTERM", () => handleShutdown("SIGTERM"));

    this.#startedAt = Date.now();
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

    // Add non-empty last list for readability
    console.log(" ");
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

  watchBuildDirectory() {
    if (!this.options.projectDirectory) return;

    // TODO: Adapt this code, so we track specific agents and restart only the one that have changed
    // TODO: Also add file content hashing, so rewriting the same file doesn't restart the agent

    // Watch for files changes in the server build directory
    // this.watcher = chokidar.watch(".", {
    //   cwd: path.join(this.options.buildDirectory, "server"),
    //   ignoreInitial: true,
    //   ignored: EXCLUDED_DEFAULTS,
    // });

    // const processWatchEvent = async (relPath: string) => {
    //   using _ = (await this.telemetry.trace("processWatchEvent()", { relPath })).start();

    //   // Ensure the path is absolute
    //   await this.stopProcesses();
    //   await this.startProcesses();
    // };

    // // Watch files add/remove/change
    // this.watcher.on("add", processWatchEvent);
    // this.watcher.on("unlink", processWatchEvent);
    // this.watcher.on("change", processWatchEvent);
  }

  async listAvailableAgents() {
    const build = await importServerBuild();
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
      const build = await importServerBuild();
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
      const startResult = await process.start();
      if (!startResult.success) return startResult;
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
      const stopResult = await process.stop();
      if (!stopResult.success) return stopResult;
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
      const restartResult = await process.restart();
      if (!restartResult.success) return restartResult;
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
