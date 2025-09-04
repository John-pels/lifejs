import { type ChildProcess, fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type BirpcReturn, createBirpc } from "birpc";
import type { AgentScope } from "@/agent/server/types";
import { importServerBuild } from "@/exports/build/server";
import { canon, type SerializableValue } from "@/shared/canon";
import { newId } from "@/shared/prefixed-id";
import type { LifeServer } from "..";
import type { ChildMethods, ParentMethods } from "./types";

export class AgentProcess {
  readonly id: string = newId("agent");
  readonly name: string;
  readonly scope: AgentScope;
  readonly transportRoom: { name: string; token: string };
  readonly sessionToken: string;
  readonly #server: LifeServer;
  readonly #pluginsContexts = {} as Record<string, SerializableValue>;
  status: "stopped" | "stopping" | "starting" | "running" = "stopped";
  lastStartedAt?: number;
  lastSeenAt?: number;
  restartCount = 0;
  nodeProcess: ChildProcess | null = null;
  #pingInterval: NodeJS.Timeout | null = null;
  #restartTimeout: NodeJS.Timeout | null = null;
  #readyResolve: (() => void) | null = null;
  #child: BirpcReturn<ChildMethods, ParentMethods> | null = null;
  #handleChildExitCallback: ((code: number | null, signal: string | null) => void) | null = null;

  constructor({
    name,
    server,
    scope,
    transportRoom,
    sessionToken,
  }: {
    name: string;
    server: LifeServer;
    scope: AgentScope;
    transportRoom: { name: string; token: string };
    sessionToken: string;
  }) {
    this.name = name;
    this.scope = scope;
    this.transportRoom = transportRoom;
    this.sessionToken = sessionToken;
    this.#server = server;
  }

  async getDefinition() {
    const servers = await importServerBuild();
    const definition = servers?.[this.name as keyof typeof servers]?.definition;
    return definition;
  }

  async start() {
    using h0 = (
      await this.#server.telemetry.trace("AgentProcess.start()", { id: this.id })
    ).start();

    try {
      // Return early if the agent is already running or starting
      if (this.status === "running" || this.status === "starting") {
        h0.log.warn({
          message: `start() was called on an already '${this.status}' agent process.`,
        });
        return { success: true };
      }

      // Error if the agent is stopping
      if (this.status === "stopping") {
        const message = `Cannot start agent in '${this.status}' state.`;
        h0.log.error({ message });
        return { success: false, message };
      }

      // Update the status
      this.status = "starting";
      const waitReady = new Promise<void>((resolve) => {
        this.#readyResolve = resolve;
      });

      // Get the agent definition
      const definition = await this.getDefinition();
      if (!definition) {
        const message = `Agent definition not found for '${this.name}'.`;
        h0.log.error({ message });
        return { success: false, message };
      }

      // Fork the child process
      const currentDir = path.dirname(fileURLToPath(import.meta.url));
      const childPath = path.join(currentDir, "..", "server", "agent-process", "child.js");
      this.nodeProcess = fork(childPath, [], {
        serialization: "json",
        silent: false,
        // Disable anonymous telemetry in the child process (managed by the parent)
        env: { LIFE_TELEMETRY_DISABLED: "true" },
      });

      // Set up RPC channel with the child process
      this.#child = createBirpc<ChildMethods, ParentMethods>(
        {
          syncContext: (params) => {
            this.#pluginsContexts[params.pluginName] = params.context;
            this.lastSeenAt = Date.now();
          },
          syncTelemetry: (signal) => {
            this.#server.telemetry.sendSignal({
              ...signal,
              scope: ["life", "server", "agent-process", this.name],
            });
            this.lastSeenAt = Date.now();
          },
          ready: () => {
            this.#readyResolve?.();
          },
        },
        {
          post: (data) => this.nodeProcess?.send(data),
          on: (fn) => this.nodeProcess?.on("message", fn),
          serialize: canon.serialize,
          deserialize: canon.deserialize,
        },
      );

      // Handle child process exit
      this.#handleChildExitCallback = this.handleChildExit.bind(this);
      this.nodeProcess.on("exit", this.#handleChildExitCallback);

      // Inject environment variables into the child process
      this.#child.injectEnvVars(process.env);

      // Start the agent server in the child process
      const startResult = await this.#child.start({
        id: this.id,
        name: this.name,
        scope: this.scope,
        transportRoom: this.transportRoom,
        pluginsContexts: this.#pluginsContexts,
        isRestart: this.restartCount > 0,
      });
      if (!startResult.success) return startResult;

      // Wait for the agent to be ready
      await waitReady;

      // Start health check
      this.startHealthCheck();

      // Update the status
      this.status = "running";
      this.lastStartedAt = Date.now();
      this.lastSeenAt = Date.now();
      this.#readyResolve = null;

      // Return that the agent was started successfully
      return { success: true };
    } catch (error) {
      // Uncaught error
      const message = `Failed to start agent '${this.name}'.`;
      h0.log.error({ message, error });
      this.status = "stopped";
      this.nodeProcess = null;
      this.lastStartedAt = undefined;
      this.lastSeenAt = undefined;
      this.#readyResolve = null;
      return { success: false, message };
    }
  }

  async stop() {
    using h0 = (await this.#server.telemetry.trace("AgentProcess.stop()", { id: this.id })).start();

    try {
      // Error if the agent is starting
      if (this.status === "starting") {
        const message = `Cannot stop agent in '${this.status}' state.`;
        h0.log.error({ message });
        return { success: false, message };
      }

      // Warn if the agent is already stopped or stopping, that might be unexpected
      if (this.status === "stopped" || this.status === "stopping") {
        h0.log.warn({ message: `stop() was called on an already '${this.status}' agent process.` });
      }

      // Update the status
      this.status = "stopping";

      // Clear any pending restart
      if (this.#restartTimeout) {
        clearTimeout(this.#restartTimeout);
        this.#restartTimeout = null;
      }

      // Stop health check
      this.stopHealthCheck();

      // Stop listening for child process exit
      if (this.#handleChildExitCallback)
        this.nodeProcess?.off("exit", this.#handleChildExitCallback);

      // Gracefully stop the agent (10s timeout)
      let stopResult: { success: boolean; message?: string } | undefined;
      try {
        await Promise.race([
          (async () => {
            stopResult = await this.#child?.stop();
          })(),
          new Promise((resolve) => setTimeout(resolve, 10_000)),
        ]);
      } catch (_) {
        // Ignore
      }
      if (!stopResult?.success) {
        h0.log.warn({
          message: `Agent process '${this.name}' did not shutdown gracefully. Will force kill. Reason: ${stopResult?.message}`,
        });
      }

      // Terminate the child process
      this.nodeProcess?.kill("SIGKILL");

      // Update the status
      this.status = "stopped";
      this.nodeProcess = null;
      this.lastStartedAt = undefined;
      this.lastSeenAt = undefined;

      // Return that the agent was stopped successfully
      return { success: true };
    } catch (error) {
      // Uncaught error
      const message = `Failed to stop agent '${this.name}'. Will force kill.`;
      h0.log.error({ message, error });
      if (this.nodeProcess && this.nodeProcess.exitCode === null) this.nodeProcess.kill("SIGKILL");
      this.status = "stopped";
      this.nodeProcess = null;
      this.lastStartedAt = undefined;
      this.lastSeenAt = undefined;
      return { success: false, message };
    }
  }

  async restart() {
    using h0 = (
      await this.#server.telemetry.trace("AgentProcess.restart()", { id: this.id })
    ).start();

    try {
      const stopResult = await this.stop();
      if (!stopResult.success) return stopResult;
      this.restartCount++;
      const startResult = await this.start();
      if (!startResult.success) return startResult;
      return { success: true };
    } catch (error) {
      const message = `Failed to restart agent '${this.name}'.`;
      h0.log.error({ message, error });
      return { success: false, message };
    }
  }

  startHealthCheck() {
    // Start pinging the agent every 10 seconds
    this.#pingInterval = setInterval(async () => {
      if (this.#child && this.status === "running") {
        try {
          await Promise.race([
            this.#child.ping(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Ping timeout")), 3000)),
          ]);
          this.lastSeenAt = Date.now();
        } catch (_) {
          this.#server.telemetry.log.error({
            message: `Health check failed for agent '${this.name}'. Will kill and restart.`,
          });
          if (this.nodeProcess) this.nodeProcess.kill("SIGKILL");
          this.lastSeenAt = undefined;
        }
      }
    }, 10_000);
  }

  stopHealthCheck() {
    // Stop pinging the agent
    if (this.#pingInterval) {
      clearInterval(this.#pingInterval);
      this.#pingInterval = null;
    }
  }

  handleChildExit(code: number | null, signal: string | null) {
    // Figure whether a restart is needed
    const wasRunning = this.status === "running" || this.status === "starting";
    const needRestart = wasRunning && this.restartCount < 3;
    let restartDelay = 0;
    if (needRestart && this.restartCount > 0) {
      restartDelay = Math.min(1000 * 2 ** this.restartCount, 30_000);
    }

    // Telemetry
    const restartDelayMessage = restartDelay > 0 ? `in ${restartDelay}ms.` : "immediately.";
    const restartMessage = needRestart ? `Restarting ${restartDelayMessage}` : "Not restarting.";
    this.#server.telemetry.log.error({
      message: `Agent process crashed (code: ${code}, signal: ${signal}). ${restartMessage}`,
      attributes: { name: this.name, id: this.id, code, signal },
    });

    // Update the status
    this.status = "stopped";
    this.nodeProcess = null;
    this.lastStartedAt = undefined;
    this.lastSeenAt = undefined;

    // Stop health check
    this.stopHealthCheck();

    // Schedule a restart if needed
    if (needRestart) {
      if (restartDelay > 0) {
        this.#restartTimeout = setTimeout(async () => {
          await this.restart();
        }, restartDelay);
      } else {
        // Restart immediately
        this.restart();
      }
    }
  }

  async getProcessStats() {
    if (!this.#child || this.status !== "running")
      return { success: false, message: "Agent is not running." };
    try {
      const stats = await this.#child.getProcessStats();
      return stats;
    } catch (error) {
      const message = `Failed to get process stats for agent '${this.name}'.`;
      this.#server.telemetry.log.error({ message, error });
      return { success: false, message, stats: null };
    }
  }
}
