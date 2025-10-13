import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import chalk from "chalk";
import chokidar, { type FSWatcher } from "chokidar";
import { prepareAgentConfig } from "@/agent/server/config";
import type { AgentScope } from "@/agent/server/types";
import { importServerBuild } from "@/exports/build/server";
import { type LifeError, lifeError } from "@/shared/error";
import { ns } from "@/shared/nanoseconds";
import * as op from "@/shared/operation";
import { newId } from "@/shared/prefixed-id";
import { ProcessStats } from "@/shared/process-stats";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/node";
import { transportProviderGetToken } from "@/transport/auth";
import packageJson from "../package.json" with { type: "json" };
import { AgentProcessClient } from "./agent-process/client";
import { LifeApi } from "./api";
import { type ServerOptions, serverOptionsSchema } from "./options";

const EXCLUDED_DEFAULTS = ["**/node_modules/**", "**/build/**", "**/generated/**", "**/dist/**"];

export class LifeServer {
  options: ServerOptions<"output">;
  telemetry: TelemetryClient;
  watcher: FSWatcher | null = null;
  api: LifeApi;
  readonly agentProcesses = new Map<string, AgentProcessClient>();

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
    return await this.telemetry.trace("start()", async (span) => {
      try {
        span.log.info({ message: "Starting server." });
        span.log.debug({ message: `Project directory: ${this.options.projectDirectory}` });
        span.log.debug({ message: `Watch: ${this.options.watch}` });
        span.log.debug({ message: `Host: ${this.options.host}` });
        span.log.debug({ message: `Port: ${this.options.port}` });

        // 1. Start watching build directory if in watch mode
        if (this.options.watch) {
          const [errWatch] = await this.watchBuildDirectory();
          if (errWatch) return op.failure(errWatch);
        }
        // Or ensure a valid build directory exists
        else {
          const [errDir] = await this.ensureBuildDirectory();
          if (errDir) return op.failure(errDir);
        }

        // 2. Start the API
        const [errApi] = await this.api.start();
        if (errApi) return op.failure(errApi);
        this.#startedAt = Date.now();
        this.telemetry.log.info({
          message: `⧉ ${chalk.italic("API")} listening on         → http://${this.options.host}:${this.options.port}/api`,
        });

        // 3. Start the Observatory web app
        // TODO
        this.telemetry.log.info({
          message: `⧉ ${chalk.italic("Observatory")} listening on → http://${this.options.host}:${this.options.port}`,
        });

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

        // Log operation with timing
        span.end();
        this.telemetry.log.info({
          message: `Server ready in ${chalk.bold(`${ns.toMs(span.getData().duration)}ms`)}.`,
        });
        if (this.options.watch) {
          this.telemetry.log.info({ message: "Watching for changes..." });
        }

        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  #stopStarted = false;
  async stop() {
    return await this.telemetry.trace("stop()", async () => {
      try {
        if (this.#stopStarted) return;
        this.#stopStarted = true;

        // Stop the API
        const [errApi] = await this.api.stop();
        if (errApi) return op.failure(errApi);

        // Stop the watcher
        await this.watcher?.close();
        this.watcher = null;

        // Stop the agent processes
        const results = await Promise.all(
          Array.from(this.agentProcesses.values()).map((process) =>
            this.agent.stop({ id: process.id, sessionToken: process.sessionToken }),
          ),
        );
        const err = results.find((result) => result[0])?.[0];
        if (err) return op.failure(err);

        // Ensure telemetry consumers have finished processing
        await this.telemetry.flushConsumers();

        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  ensureBuildDirectory() {
    return this.telemetry.trace("ensureBuildDirectory()", (span) => {
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
            message: `No .life/ directory found at: ${buildDir}. Run 'life build' first.`,
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

        span.log.debug({
          message: "Valid .life/ build directory found.",
          attributes: {
            projectDirectory: this.options.projectDirectory,
            buildDirectory: buildDir,
          },
        });

        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  async watchBuildDirectory() {
    return await this.telemetry.trace("watchBuildDirectory()", async () => {
      try {
        // Get the raw server directory
        const buildDir = join(this.options.projectDirectory, ".life");
        const signalDir = join(buildDir, "server", "signal");

        // Initialize content hashes for existing agent files to track actual changes
        const { readdirSync } = await import("node:fs");
        const files = readdirSync(signalDir).filter((file) => file.endsWith(".txt"));

        // Read all files in parallel to avoid await-in-loop issue
        await Promise.all(
          files.map(async (file) => {
            const filePath = join(signalDir, file);
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
          cwd: signalDir,
          ignoreInitial: true,
          ignored: EXCLUDED_DEFAULTS,
          awaitWriteFinish: {
            stabilityThreshold: 50,
            pollInterval: 5,
          },
        });

        const processWatchEvent = async (action: "change", relPath: string) => {
          await this.telemetry.trace("processWatchEvent()", async (span) => {
            span.setAttributes({ action, relPath });

            try {
              const absPath = join(signalDir, relPath);

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
              const agentName = basename(relPath, ".txt");
              const formattedAgentName = chalk.bold.italic(agentName);
              span.log.info({
                message: `Detected change in agent '${formattedAgentName}', restarting affected processes...`,
                attributes: { agentName, path: absPath },
              });

              // Find all running processes for this agent
              const processesToRestart: AgentProcessClient[] = [];
              for (const [, process] of this.agentProcesses) {
                if (process.definition.name === agentName && process.status === "running") {
                  processesToRestart.push(process);
                }
              }

              if (processesToRestart.length === 0) {
                span.log.info({
                  message: `No running processes found for agent '${formattedAgentName}'.`,
                  attributes: { agentName },
                });
                return;
              }

              // Restart affected processes in parallel and track timing
              await Promise.all(processesToRestart.map((p) => p.restart()));

              // Log operation with timing similar to compiler
              span.end();
              const instanceCount = processesToRestart.length;
              this.telemetry.log.info({
                message: `Restarted ${instanceCount} instance${instanceCount > 1 ? "s" : ""} of agent '${formattedAgentName}' in ${chalk.bold(`${ns.toMs(span.getData().duration)}ms`)}.`,
                attributes: { agentName, instanceCount },
              });
            } catch (error) {
              span.log.error({
                message: "Failed to process watch event",
                error,
                attributes: { path: relPath },
              });
            }
          });
        };

        // Listen for file changes
        this.watcher.on("change", (relPath) => processWatchEvent("change", relPath));

        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  checkSessionToken(id: string, sessionToken: string) {
    return this.telemetry.trace("checkSessionToken()", (span) => {
      span.setAttributes({ id });

      try {
        const [errGet, process] = this.getAgentProcess(id);
        if (errGet) return op.failure(errGet);

        if (process.sessionToken !== sessionToken) {
          return op.failure({
            code: "Forbidden",
            message: `Invalid session token for agent process '${id}'.`,
          });
        }

        return op.success(process);
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    });
  }

  getAgentProcess(id: string) {
    return this.telemetry.trace("getAgentProcess()", (span) => {
      span.setAttributes({ id });

      try {
        const process = this.agentProcesses.get(id);
        if (!process)
          return op.failure({ code: "NotFound", message: `Agent process '${id}' not found.` });
        return op.success(process);
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: `Failed to obtain agent process '${id}'.`,
          cause: error,
        });
      }
    });
  }

  server = {
    //
    available: async () => {
      return await this.telemetry.trace("server.available()", async () => {
        try {
          const [errIndex, buildIndex] = await importServerBuild({
            projectDirectory: this.options.projectDirectory,
            noCache: true,
          });
          if (errIndex) return op.failure(errIndex);
          return op.success(
            Object.entries(buildIndex).map(([name, { definition }]) => ({
              name,
              scopeKeys: definition?.scope?.schema?.shape
                ? Object.keys(definition.scope.schema.shape)
                : [],
            })),
          );
        } catch (error) {
          return op.failure({ code: "Unknown", cause: error });
        }
      });
    },
    //
    ping: () => {
      return this.telemetry.trace("server.ping()", () => {
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
          return op.failure({
            code: "Unknown",
            message: "Failed to get server info",
            cause: error,
          });
        }
      });
    },
    //
    processes: () => {
      return this.telemetry.trace("server.processes()", () => {
        try {
          return op.success(
            Array.from(this.agentProcesses.values()).map((process) => ({
              id: process.id,
              name: process.definition.name,
              status: process.status,
              lastStartedAt: process.lastStartedAt,
            })),
          );
        } catch (error) {
          return op.failure({ code: "Unknown", cause: error });
        }
      });
    },
    // info
    info: () => {
      return this.telemetry.trace("server.info()", () => {
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
          return op.failure({
            code: "Unknown",
            message: "Failed to get server info",
            cause: error,
          });
        }
      });
    },
  };

  #createProcessErrorHint(initialError: LifeError, id: string, name: string, message: string) {
    const formattedName = chalk.bold(
      `${chalk.italic(name)} (${id.replace("agent_", "").slice(0, 6)})`,
    );
    const hint = `${message}. See agent ${formattedName} logs for more details.`;
    const hintError = lifeError({
      code: initialError.code,
      message: hint,
    });
    hintError.stack = undefined;
    return hintError;
  }

  agent = {
    //
    create: async ({ id, name }: { id?: string; name: string }) => {
      return await this.telemetry.trace("agent.create()", async (span) => {
        try {
          // Ensure the request agent exists
          const [errIndex, buildIndex] = await importServerBuild({
            projectDirectory: this.options.projectDirectory,
            noCache: true,
          });
          if (errIndex) return op.failure(errIndex);
          const build = buildIndex[name as keyof typeof buildIndex];
          if (!build)
            return op.failure({
              code: "NotFound",
              message: `Agent '${name}' not found.`,
              isPublic: true,
            });

          // Obtain the final agent config
          const [errConfig, config] = prepareAgentConfig(
            build.definition.config,
            build.globalConfigs,
          );
          if (errConfig) return op.failure(errConfig);

          // Create the agent process
          const process = new AgentProcessClient({
            id,
            definition: build.definition,
            config: config.server,
            server: this,
          });
          span.setAttributes({ id: process.id, name });

          // Add the agent process to the map
          this.agentProcesses.set(process.id, process);

          return op.success({ id: process.id, clientConfig: config.client });
        } catch (error) {
          return op.failure({
            code: "Unknown",
            message: `Failed to create agent process '${name}'.`,
            cause: error,
          });
        }
      });
    },
    //
    start: async ({ id, request, scope }: { id: string; request: Request; scope: AgentScope }) => {
      return await this.telemetry.trace("agent.start()", async (span) => {
        span.setAttributes({ id });

        try {
          const [errGet, process] = this.getAgentProcess(id);
          if (errGet) return op.failure(errGet);

          // Ensure the request emitter has access to this agent and scope
          if (!(await process.definition.scope.hasAccess({ request, scope }))) {
            return op.failure({
              code: "Forbidden",
              message: `Access denied for agent '${process.definition.name}'.`,
              isPublic: true,
            });
          }

          // Generate a room name for the WebRTC session
          const roomName = newId("room");

          // Generate transport tokens for both the agent and the user
          const transportProvider = process.config.transport.provider;
          const transportGetToken =
            transportProviderGetToken[transportProvider as keyof typeof transportProviderGetToken];
          const [errAgentToken, agentToken] = await transportGetToken(
            process.config.transport,
            roomName,
            "agent",
          );
          if (errAgentToken) return op.failure(errAgentToken);
          const [errUserToken, userToken] = await transportGetToken(
            process.config.transport,
            roomName,
            "user",
          );
          if (errUserToken) return op.failure(errUserToken);

          // Start the process
          const [errStart] = await process.start({
            scope,
            transportRoom: { name: roomName, token: agentToken },
          });

          if (errStart) {
            const hintError = this.#createProcessErrorHint(
              errStart,
              process.id,
              process.definition.name,
              "Error while starting agent process",
            );
            return op.failure(hintError);
          }

          return op.success({
            sessionToken: process.sessionToken,
            transportRoom: { name: roomName, token: userToken },
          });
        } catch (error) {
          return op.failure({
            code: "Unknown",
            message: `Failed to start agent process '${id}'.`,
            cause: error,
          });
        }
      });
    },
    //
    stop: async ({ id, sessionToken }: { id: string; sessionToken: string }) => {
      return await this.telemetry.trace("agent.stop()", async (span) => {
        span.setAttributes({ id });

        try {
          // Get the agent process
          const [errGet, process] = this.getAgentProcess(id);
          if (errGet) return op.failure(errGet);

          // Ensure the session token is valid
          const [errCheckSessionToken] = await this.checkSessionToken(id, sessionToken);
          if (errCheckSessionToken) return op.failure(errCheckSessionToken);

          // Track timing for stopping the process

          // Stop the process
          const [errStop] = await process.stop();
          if (errStop) {
            const hintError = this.#createProcessErrorHint(
              errStop,
              process.id,
              process.definition.name,
              "Error while stopping agent process",
            );
            return op.failure(hintError);
          }

          // Remove the process from the map
          this.agentProcesses.delete(process.id);

          return op.success();
        } catch (error) {
          return op.failure({
            code: "Unknown",
            message: `Failed to stop agent process '${id}'.`,
            cause: error,
          });
        }
      });
    },
    //
    restart: async ({ id, sessionToken }: { id: string; sessionToken: string }) => {
      return await this.telemetry.trace("agent.restart()", async (span) => {
        span.setAttributes({ id });

        try {
          // Get the agent process
          const [errGet, process] = this.getAgentProcess(id);
          if (errGet) return op.failure(errGet);

          // Ensure the session token is valid
          const [errCheckSessionToken] = await this.checkSessionToken(id, sessionToken);
          if (errCheckSessionToken) return op.failure(errCheckSessionToken);

          // Track timing for restarting the process

          // Restart the process
          const [errRestart] = await process.restart();
          if (errRestart) {
            const hintError = this.#createProcessErrorHint(
              errRestart,
              process.id,
              process.definition.name,
              "Error while restarting agent process",
            );
            return op.failure(hintError);
          }

          return op.success();
        } catch (error) {
          return op.failure({
            code: "Unknown",
            message: `Failed to restart agent process '${id}'.`,
            cause: error,
          });
        }
      });
    },
    //
    ping: async ({ id, sessionToken }: { id: string; sessionToken: string }) => {
      return await this.telemetry.trace("agent.ping()", async (span) => {
        span.setAttributes({ id });

        try {
          // Get the agent process
          const [errGet, process] = this.getAgentProcess(id);
          if (errGet) return op.failure(errGet);

          // Ensure the session token is valid
          const [errCheckSessionToken] = await this.checkSessionToken(id, sessionToken);
          if (errCheckSessionToken) return op.failure(errCheckSessionToken);

          // Ping the process
          const [errPing] = await process.ping();
          if (errPing) {
            const hintError = this.#createProcessErrorHint(
              errPing,
              process.id,
              process.definition.name,
              "Error while pinging agent process",
            );
            return op.failure(hintError);
          }

          return op.success("pong");
        } catch (error) {
          return op.failure({
            code: "Unknown",
            message: `Failed to ping agent process '${id}'.`,
            cause: error,
          });
        }
      });
    },
    //
    info: async ({ id, sessionToken }: { id: string; sessionToken: string }) => {
      return await this.telemetry.trace("agent.info()", async (span) => {
        span.setAttributes({ id });

        try {
          // Get the agent process
          const [errGet, process] = this.getAgentProcess(id);
          if (errGet) return op.failure(errGet);

          // Ensure the session token is valid
          const [errCheckSessionToken] = await this.checkSessionToken(id, sessionToken);
          if (errCheckSessionToken) return op.failure(errCheckSessionToken);

          // Get the process stats
          const [errStats, stats] = await process.getProcessStats();
          if (errStats) {
            const hintError = this.#createProcessErrorHint(
              errStats,
              process.id,
              process.definition.name,
              "Error while obtaining agent process stats",
            );
            return op.failure(hintError);
          }

          return op.success({
            id,
            name: process.definition.name,
            scope: process.lastScope,
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
            cause: error,
          });
        }
      });
    },
  };
}
