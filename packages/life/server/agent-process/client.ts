import { type ChildProcess, fork } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type BirpcReturn, createBirpc } from "birpc";
import chalk from "chalk";
import type { AgentScope } from "@/agent/server/types";
import { importServerBuild } from "@/exports/build/server";
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
  readonly name: string;
  readonly sessionToken = randomBytes(32).toString("base64url");
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

  //
  readonly #pluginsContexts = {} as Record<string, SerializableValue>;
  #child: BirpcReturn<ChildMethods, ParentMethods> | null = null;
  #pingInterval: NodeJS.Timeout | null = null;
  #restartTimeout: NodeJS.Timeout | null = null;
  #readyResolve: (() => void) | null = null;
  #handleChildExitCallback: ((code: number | null, signal: string | null) => void) | null = null;

  constructor({
    id,
    name,
    server,
  }: {
    id?: string;
    name: string;
    server: LifeServer;
  }) {
    this.id = id ?? newId("agent");
    this.name = name;
    this.#server = server;

    // Initialize telemetry client with scope "server.agentProcess"
    this.#telemetry = createTelemetryClient("server", {
      watch: server.options.watch,
    });
  }

  async getDefinition() {
    return await this.#telemetry.trace("AgentProcess.getDefinition()", async (span) => {
      span.setAttributes({ agentId: this.id });
      try {
        const [error, servers] = await op.attempt(
          importServerBuild({
            projectDirectory: this.#server.options.projectDirectory,
            noCache: true,
          }),
        );
        if (error) return op.failure(error);
        const definition = servers?.[this.name as keyof typeof servers]?.definition;
        if (!definition) {
          return op.failure({
            code: "NotFound",
            message: `Agent '${this.name}' not found.`,
            isPublic: true,
          });
        }
        return op.success(definition);
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    });
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

        // Get the agent definition
        const [errGet] = await this.getDefinition();
        if (errGet) {
          await this.stop();
          return op.failure(errGet);
        }

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
          silent: false,
          cwd: this.#server.options.projectDirectory,
          // Disable anonymous telemetry in the child process (managed by the parent)
          env: { LIFE_TELEMETRY_DISABLED: "true" },
        });

        // Set up RPC channel with the child process (after child is ready)
        this.#child = createBirpc<ChildMethods, ParentMethods>(
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
                  attributes: { agentId: this.id, agentName: this.name, data },
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
                  attributes: { agentId: this.id, agentName: this.name, data },
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
        this.#handleChildExitCallback = this.handleChildExit.bind(this);
        this.nodeProcess.on("exit", this.#handleChildExitCallback);

        // Inject environment variables into the child process
        const [errEnv] = await this.#child.injectEnvVars(process.env);
        if (errEnv) {
          await this.stop();
          return op.failure(errEnv);
        }

        // Start the agent server in the child process
        const [errStart] = await this.#child.start({
          id: this.id,
          name: this.name,
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
        if (this.#handleChildExitCallback)
          this.nodeProcess?.off("exit", this.#handleChildExitCallback);

        // Gracefully stop the agent (10s timeout)
        if (this.#child) {
          const [errStop] = await Promise.race([
            this.#child.stop(),
            new Promise<op.OperationResult<void>>((resolve) =>
              setTimeout(() => resolve(op.failure({ code: "Timeout" })), 10_000),
            ),
          ]);
          if (errStop) {
            span.log.warn({
              message: `Agent process '${this.name}' did not shutdown gracefully, will force kill. (${errStop ? "see error" : "timeout"})`,
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
      if (this.#child && this.status === "running") {
        // Send a ping to the agent
        const [errPing] = await Promise.race([
          this.#child?.ping(),
          new Promise<op.OperationResult<void>>((resolve) =>
            setTimeout(() => resolve(op.failure({ code: "Timeout" })), 3000),
          ),
        ]);

        // In case of error, kill the agent and restart
        if (errPing) {
          this.#telemetry.log.error({
            message: `Health check failed for agent '${this.name}'. Will kill and restart.`,
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
    const restartMessage = chalk.bold(
      needRestart ? `Restarting ${restartDelayMessage}` : "Not restarting.",
    );
    this.#server.telemetry.log.error({
      message: `Agent process crashed. ${restartMessage}`,
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
      return op.failure({ code: "Validation", message: "Agent is not running.", isPublic: true });
    try {
      const [errStats, stats] = await this.#child.getProcessStats();
      if (errStats) return op.failure(errStats);
      return op.success(stats);
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  async ping() {
    try {
      if (!this.#child || this.status !== "running")
        return op.failure({ code: "Validation", message: "Agent is not running.", isPublic: true });
      const [errPing] = await this.#child.ping();
      if (errPing) return op.failure(errPing);
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }
}
