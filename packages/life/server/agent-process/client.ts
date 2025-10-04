import { type ChildProcess, fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type BirpcReturn, createBirpc } from "birpc";
import chalk from "chalk";
import type z from "zod";
import type { agentServerConfig } from "@/agent/server/config";
import type { AgentDefinition, AgentScope } from "@/agent/server/types";
import { canon, type SerializableValue } from "@/shared/canon";
import { isLifeError, lifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import { newId } from "@/shared/prefixed-id";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/node";
import type { LifeServer } from "..";
import type { ChildMethods, ParentMethods } from "./types";

export class AgentProcessClient {
  readonly id: string;
  readonly sessionToken = randomBytes(32).toString("base64url");
  readonly config: z.output<typeof agentServerConfig.schema>;
  readonly definition: AgentDefinition;
  readonly #server: LifeServer;
  readonly #telemetry: TelemetryClient;

  lastScope: AgentScope | null = null;
  lastTransportRoom: { name: string; token: string } | null = null;

  // Health infos
  status: "stopped" | "stopping" | "starting" | "running" = "stopped";
  lastStartedAt?: number;
  lastSeenAt?: number;
  restartCount = 0;
  nodeProcess: ChildProcess | null = null;

  // Stdio output captured immediately after fork
  stdLines: string[] = [];
  #stdLineCallbacks: Array<(line: string) => void> = [];

  //
  readonly #pluginsContexts = {} as Record<string, SerializableValue>;
  #process: BirpcReturn<ChildMethods, ParentMethods> | null = null;
  #pingInterval: NodeJS.Timeout | null = null;
  #restartTimeout: NodeJS.Timeout | null = null;
  #readyResolve: (() => void) | null = null;
  #handleProcessExitCallback: ((code: number | null, signal: string | null) => void) | null = null;

  constructor({
    id,
    definition,
    config,
    server,
  }: {
    id?: string;
    definition: AgentDefinition;
    config: z.output<typeof agentServerConfig.schema>;
    server: LifeServer;
  }) {
    this.id = id ?? newId("agent");
    this.definition = definition;
    this.config = config;
    this.#server = server;

    // Initialize telemetry client with scope "server.agentProcess"
    this.#telemetry = server.telemetry;
  }

  async start({
    scope,
    transportRoom,
  }: {
    scope: AgentScope;
    transportRoom: { name: string; token: string };
  }) {
    return await this.#telemetry.trace("AgentProcess.start()", async (span) => {
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
          await this.stop();
          return op.failure({
            code: "Conflict",
            message: `Cannot start agent in '${this.status}' state.`,
            isPublic: true,
          });
        }

        // Update the status
        this.status = "starting";
        const waitReady = new Promise<void>((resolve) => (this.#readyResolve = resolve));

        // Update the scope and transport room
        this.lastScope = scope;
        this.lastTransportRoom = transportRoom;

        // Fork the child process
        const currentDir = path.dirname(fileURLToPath(import.meta.url));

        // Since we're running from TypeScript source, but need to fork the compiled child,
        // we need to resolve to the dist directory
        const childPath = path.join(
          currentDir,
          "..",
          "..",
          "dist",
          "server",
          "agent-process",
          "process.mjs",
        );
        this.nodeProcess = fork(childPath, [], {
          serialization: "json",
          silent: true,
          cwd: this.#server.options.projectDirectory,
          // Disable anonymous telemetry in the child process (managed by the parent)
          env: { ...process.env, LIFE_TELEMETRY_DISABLED: "true" },
        });

        // Capture stdout/stderr immediately to avoid losing output
        this.nodeProcess.stdout?.on("data", (data: Buffer) => {
          const lines = data.toString().split("\n").filter((line) => line.trim());
          this.stdLines.push(...lines);
          for (const line of lines) {
            for (const callback of this.#stdLineCallbacks) {
              callback(line);
            }
          }
        });
        this.nodeProcess.stderr?.on("data", (data: Buffer) => {
          const lines = data.toString().split("\n").filter((line) => line.trim());
          this.stdLines.push(...lines);
          for (const line of lines) {
            for (const callback of this.#stdLineCallbacks) {
              callback(line);
            }
          }
        });

        // Set up RPC channel with the child process (after child is ready)
        this.#process = createBirpc<ChildMethods, ParentMethods>(
          {
            syncContext: (params) => {
              try {
                this.#pluginsContexts[params.pluginName] = params.context;
                this.lastSeenAt = Date.now();
                return op.success();
              } catch (error) {
                return op.failure({ code: "Unknown", cause: error });
              }
            },
            syncTelemetry: (signal) => {
              try {
                // Override the attributes with the agent process attributes
                signal.attributes ||= {};
                signal.attributes.watch = this.#server.options.watch;

                // Forward the signal to the client telemetry client
                this.#telemetry.sendSignal(signal);
                return op.success();
              } catch (error) {
                return op.failure({ code: "Unknown", cause: error });
              }
            },
            ready: () => {
              try {
                this.#readyResolve?.();
                return op.success();
              } catch (error) {
                return op.failure({ code: "Unknown", cause: error });
              }
            },
          },
          {
            post: (data) => this.nodeProcess?.send(data),
            on: (fn) => this.nodeProcess?.on("message", fn),
            serialize: (data) => {
              const [error, result] = canon.serialize(data);
              if (error) {
                throw lifeError({
                  code: "Validation",
                  message:
                    "Failed to serialize data from server to agent process. The message has been discarded.",
                  attributes: { agentId: this.id, agentName: this.definition.name, data },
                  cause: error,
                });
              }
              return result;
            },
            deserialize: (data) => {
              const [error, result] = canon.deserialize(data);
              if (error) {
                throw lifeError({
                  code: "Validation",
                  message:
                    "Failed to deserialize data from server to agent process. The message has been discarded.",
                  attributes: { agentId: this.id, agentName: this.definition.name, data },
                  cause: error,
                });
              }
              return result;
            },
            onFunctionError: (error) => {
              this.#telemetry.log.error(
                isLifeError(error)
                  ? error
                  : lifeError({
                      code: "Unknown",
                      cause: error,
                    }),
              );
            },
            onGeneralError: (error) => {
              this.#telemetry.log.error(
                isLifeError(error)
                  ? error
                  : lifeError({
                      code: "Unknown",
                      cause: error,
                    }),
              );
            },
            // Disable Birpc timeout
            onTimeoutError: () => true,
            timeout: -1,
          },
        );

        // Handle child process exit
        this.#handleProcessExitCallback = this.handleProcessExit.bind(this);
        this.nodeProcess.on("exit", this.#handleProcessExitCallback);

        // Start the agent server in the child process
        const [errStart] = await this.#process.start({
          id: this.id,
          name: this.definition.name,
          scope: this.lastScope,
          transportRoom,
          pluginsContexts: this.#pluginsContexts,
          isRestart: this.restartCount > 0,
        });
        if (errStart) {
          await this.stop();
          return op.failure(errStart);
        }

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
        await this.stop();
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  async stop() {
    return await this.#telemetry.trace("AgentProcess.stop()", async (span) => {
      span.setAttributes({ agentId: this.id });

      try {
        // Return early if the agent is stopped or already stopping
        if (this.status === "stopped" || this.status === "stopping") return op.success();

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
        if (this.#handleProcessExitCallback)
          this.nodeProcess?.off("exit", this.#handleProcessExitCallback);

        // Gracefully stop the agent (10s timeout)
        if (this.#process) {
          const [errStop] = await Promise.race([
            this.#process.stop(),
            new Promise<op.OperationResult<void>>((resolve) =>
              setTimeout(() => resolve(op.failure({ code: "Timeout" })), 10_000),
            ),
          ]);
          if (errStop) {
            span.log.warn({
              message: `Agent process '${this.definition.name}' did not shutdown gracefully, will force kill. (${errStop ? "see error" : "timeout"})`,
              error: errStop,
            });
          }
        }

        // Terminate the child process
        this.nodeProcess?.kill("SIGKILL");

        // Update the status
        this.status = "stopped";
        this.nodeProcess = null;
        this.lastStartedAt = undefined;
        this.lastSeenAt = undefined;

        // Clear stdio buffer and callbacks
        this.stdLines = [];
        this.#stdLineCallbacks = [];

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
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  async restart() {
    return await this.#telemetry.trace("AgentProcess.restart()", async (span) => {
      span.setAttributes({ agentId: this.id });

      try {
        const [errStop] = await this.stop();
        if (errStop) return op.failure(errStop);
        if (!(this.lastScope && this.lastTransportRoom)) {
          return op.failure({
            code: "Conflict",
            message: "Agent must be started before it can be restarted.",
            isPublic: true,
          });
        }
        this.restartCount++;
        const [errStart] = await this.start({
          scope: this.lastScope,
          transportRoom: this.lastTransportRoom,
        });
        if (errStart) return op.failure(errStart);
        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  // Start pinging the agent every 10 seconds
  startHealthCheck() {
    this.#pingInterval = setInterval(async () => {
      if (this.#process && this.status === "running") {
        // Send a ping to the agent
        const [errPing] = await Promise.race([
          this.#process?.ping(),
          new Promise<op.OperationResult<void>>((resolve) =>
            setTimeout(() => resolve(op.failure({ code: "Timeout" })), 3000),
          ),
        ]);

        // In case of error, kill the agent and restart
        if (errPing) {
          this.#telemetry.log.error({
            message: `Health check failed for agent '${this.definition.name}'. Will kill and restart.`,
            error: errPing,
          });
          if (this.nodeProcess) this.nodeProcess.kill("SIGKILL");
          this.lastSeenAt = undefined;
        }

        // Otherwise, update the last seen at
        else this.lastSeenAt = Date.now();
      }
    }, 10_000);
  }

  // Stop pinging the agent
  stopHealthCheck() {
    if (this.#pingInterval) {
      clearInterval(this.#pingInterval);
      this.#pingInterval = null;
    }
  }

  handleProcessExit(code: number | null, signal: string | null) {
    // Figure whether a restart is needed
    const wasRunning = this.status === "running" || this.status === "starting";
    const needRestart = wasRunning && this.restartCount < 3;
    let restartDelay = 0;
    if (needRestart && this.restartCount > 0) {
      restartDelay = Math.min(1000 * 2 ** this.restartCount, 30_000);
    }

    // Telemetry
    const restartDelayMessage = restartDelay > 0 ? `in ${restartDelay}ms.` : "immediately.";
    const restartMessage = chalk.bold(
      needRestart ? `Restarting ${restartDelayMessage}` : "Not restarting.",
    );
    this.#server.telemetry.log.error({
      message: `Agent process crashed. ${restartMessage}`,
      attributes: { name: this.definition.name, id: this.id, code, signal },
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
    if (!this.#process || this.status !== "running")
      return op.failure({ code: "Validation", message: "Agent is not running.", isPublic: true });
    try {
      const [errStats, stats] = await this.#process.getProcessStats();
      if (errStats) return op.failure(errStats);
      return op.success(stats);
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  async ping() {
    try {
      if (!this.#process || this.status !== "running")
        return op.failure({ code: "Validation", message: "Agent is not running.", isPublic: true });
      const [errPing] = await this.#process.ping();
      if (errPing) return op.failure(errPing);
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  onStdLine(callback: (line: string) => void): () => void {
    this.#stdLineCallbacks.push(callback);
    return () => {
      const index = this.#stdLineCallbacks.indexOf(callback);
      if (index > -1) {
        this.#stdLineCallbacks.splice(index, 1);
      }
    };
  }
}
