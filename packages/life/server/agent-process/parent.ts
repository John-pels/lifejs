import { type ChildProcess, fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type BirpcReturn, createBirpc } from "birpc";
import type { AgentScope } from "@/agent/server/types";
import { importServerBuild } from "@/exports/build/server";
import { canon, type SerializableValue } from "@/shared/canon";
import type { LifeError } from "@/shared/error";
import * as op from "@/shared/operation";
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
    return await this.#server.telemetry.trace("AgentProcess.getDefinition()", async (span) => {
      span.setAttributes({ agentId: this.id });
      try {
        const [error, servers] = await op.attempt(importServerBuild(true));
        if (error) return op.failure(error);
        const definition = servers?.[this.name as keyof typeof servers]?.definition;
        return op.success(definition);
      } catch (error) {
        return op.failure({ code: "Unknown", error });
      }
    });
  }

  async start() {
    return await this.#server.telemetry.trace("AgentProcess.start()", async (span) => {
      span.setAttributes({ agentId: this.id });
      try {
        // Return early if the agent is already running or starting
        if (this.status === "running" || this.status === "starting") {
          span.log.warn({
            message: `start() was called on an already '${this.status}' agent process.`,
          });
          return op.success();
        }

        // Error if the agent is stopping
        if (this.status === "stopping") {
          return op.failure({
            code: "Conflict",
            message: `Cannot start agent in '${this.status}' state.`,
          });
        }

        // Update the status
        this.status = "starting";
        const waitReady = new Promise<void>((resolve) => {
          this.#readyResolve = resolve;
        });

        // Get the agent definition
        const [errGet, definition] = await this.getDefinition();
        if (errGet) return op.failure(errGet);
        if (!definition) {
          return op.failure({ code: "NotFound", message: `Agent '${this.name}' not found.` });
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
              try {
                this.#pluginsContexts[params.pluginName] = params.context;
                this.lastSeenAt = Date.now();
                return op.success();
              } catch (error) {
                return op.failure({ code: "Unknown", error });
              }
            },
            syncTelemetry: (signal) => {
              try {
                this.#server.telemetry.sendSignal(signal);
                this.lastSeenAt = Date.now();
                return op.success();
              } catch (error) {
                return op.failure({ code: "Unknown", error });
              }
            },
            ready: () => {
              try {
                this.#readyResolve?.();
                return op.success();
              } catch (error) {
                return op.failure({ code: "Unknown", error });
              }
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
        const [errStart] = await this.#child.start({
          id: this.id,
          name: this.name,
          scope: this.scope,
          transportRoom: this.transportRoom,
          pluginsContexts: this.#pluginsContexts,
          isRestart: this.restartCount > 0,
        });
        if (errStart) return op.failure(errStart);

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
        return op.success();
      } catch (error) {
        // Uncaught error
        this.status = "stopped";
        this.nodeProcess = null;
        this.lastStartedAt = undefined;
        this.lastSeenAt = undefined;
        this.#readyResolve = null;
        return op.failure({
          code: "Unknown",
          message: `Failed to start agent '${this.name}'.`,
          error,
        });
      }
    });
  }

  async stop() {
    return await this.#server.telemetry.trace("AgentProcess.stop()", async (span) => {
      span.setAttributes({ agentId: this.id });

      try {
        // Error if the agent is starting
        if (this.status === "starting") {
          return op.failure({
            code: "Conflict",
            message: `Cannot stop agent in '${this.status}' state.`,
          });
        }

        // Warn if the agent is already stopped or stopping, that might be unexpected
        if (this.status === "stopped" || this.status === "stopping") {
          span.log.warn({
            message: `stop() was called on an already '${this.status}' agent process.`,
          });
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
        let stopErr: LifeError | undefined;
        let stopSuccess = false;
        try {
          await Promise.race([
            (async () => {
              const result = await this.#child?.stop();
              stopErr = result?.[0];
              stopSuccess = Boolean(!stopErr);
            })(),
            new Promise((resolve) => setTimeout(resolve, 10_000)),
          ]);
        } catch (_) {
          // Ignore
        }
        if (!stopSuccess) {
          span.log.warn({
            message: `Agent process '${this.name}' did not shutdown gracefully, will force kill. (${stopErr ? "(see error)" : "(timeout)"})`,
            error: stopErr,
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
        return op.success();
      } catch (error) {
        // Uncaught error
        if (this.nodeProcess && this.nodeProcess.exitCode === null)
          this.nodeProcess.kill("SIGKILL");
        this.status = "stopped";
        this.nodeProcess = null;
        this.lastStartedAt = undefined;
        this.lastSeenAt = undefined;
        return op.failure({
          code: "Unknown",
          message: `Failed to stop agent '${this.name}', will force kill.`,
          error,
        });
      }
    });
  }

  async restart() {
    return await this.#server.telemetry.trace("AgentProcess.restart()", async (span) => {
      span.setAttributes({ agentId: this.id });

      try {
        const [errStop] = await this.stop();
        if (errStop) return op.failure(errStop);
        this.restartCount++;
        const [errStart] = await this.start();
        if (errStart) return op.failure(errStart);
        return op.success();
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: `Failed to restart agent '${this.name}'.`,
          error,
        });
      }
    });
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
      return op.failure({ code: "NotFound", message: "Agent is not running." });
    try {
      const [errStats, stats] = await this.#child.getProcessStats();
      if (errStats) return op.failure(errStats);
      return op.success(stats);
    } catch (error) {
      return op.failure({
        code: "Unknown",
        message: `Failed to get process stats for agent '${this.name}'.`,
        error,
      });
    }
  }

  async ping() {
    try {
      if (!this.#child || this.status !== "running")
        return op.failure({ code: "NotFound", message: "Agent is not running." });
      const [errPing] = await this.#child.ping();
      if (errPing) return op.failure(errPing);
      return op.success();
    } catch (error) {
      return op.failure({
        code: "Unknown",
        message: `Failed to ping agent '${this.name}'.`,
        error,
      });
    }
  }
}
