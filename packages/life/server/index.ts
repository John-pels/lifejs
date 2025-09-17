import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import chalk from "chalk";
import chokidar, { type FSWatcher } from "chokidar";
import { agentClientConfig } from "@/agent/client/config";
import { agentServerConfig } from "@/agent/server/config";
import type { AgentScope } from "@/agent/server/types";
import { importServerBuild } from "@/exports/build/server";
import { ns } from "@/shared/nanoseconds";
import * as op from "@/shared/operation";
import { newId } from "@/shared/prefixed-id";
import { ProcessStats } from "@/shared/process-stats";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/node";
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
  readonly agentProcesses = new Map<string, AgentProcess>();
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

        // 1. Ensure a valid build directory exists
        const [errDir] = await this.ensureBuildDirectory();
        if (errDir) return op.failure(errDir);

        // 2. Start the API
        const [errApi] = await this.api.start();
        if (errApi) return op.failure(errApi);
        this.#startedAt = Date.now();

        // 3. Start watching build directory if in watch mode
        if (this.options.watch) {
          const [errWatch] = await this.watchBuildDirectory();
          if (errWatch) return op.failure(errWatch);
        }

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
        return op.failure({ code: "Unknown", error });
      }
    });
  }

  #stopStarted = false;
  async stop() {
    return await this.telemetry.trace("stop()", async (span) => {
      try {
        if (this.#stopStarted) return;
        this.#stopStarted = true;

        span.log.info({ message: "Stopping server." });

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
        return op.failure({ code: "Unknown", error });
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
            message: `The .life/ build directory not found at: ${buildDir}. Run 'life build' first.`,
          });
        }

        // Check if client index exists
        const clientIndex = join(buildDir, "client", "index.ts");
        console.log("CLIENT INDEX", clientIndex);
        if (!existsSync(clientIndex)) {
          return op.failure({
            code: "NotFound",
            message: `The .life/ build directory appears to be incomplete. Run 'life build' again.`,
          });
        }

        // Check if server dist index exists
        const serverIndex = join(buildDir, "server", "dist", "index.js");
        console.log("SERVER INDEX", serverIndex);
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
        return op.failure({ code: "Unknown", error });
      }
    });
  }

  async watchBuildDirectory() {
    return await this.telemetry.trace("watchBuildDirectory()", async () => {
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
          await this.telemetry.trace("processWatchEvent()", async (span) => {
            span.setAttributes({ action, relPath });

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

              span.log.debug({
                message: `Detected change in agent '${agentName}', restarting affected processes.`,
                attributes: { agentName, path: absPath },
              });

              // Find all running processes for this agent
              const processesToRestart: AgentProcess[] = [];
              for (const [, process] of this.agentProcesses) {
                if (process.name === agentName && process.status === "running") {
                  processesToRestart.push(process);
                }
              }

              if (processesToRestart.length === 0) {
                span.log.debug({
                  message: `No running processes found for agent '${agentName}'.`,
                  attributes: { agentName },
                });
                return;
              }

              // Restart affected processes in parallel and track timing
              await this.telemetry.trace("restart-agent-processes", async (spanRestart) => {
                spanRestart.setAttributes({ agentName, count: processesToRestart.length });

                await Promise.all(
                  processesToRestart.map(async (process) => {
                    span.log.debug({
                      message: `Restarting process '${process.id}' for agent '${agentName}'.`,
                      attributes: { processId: process.id, agentName },
                    });
                    await process.restart();
                  }),
                );

                // Log operation with timing similar to compiler
                spanRestart.end();
                const instanceCount = processesToRestart.length;
                const formattedName = chalk.bold.italic(agentName);
                span.log.info({
                  message: `Restarted ${instanceCount} instance${instanceCount > 1 ? "s" : ""} of '${formattedName}' in ${chalk.bold(`${ns.toMs(spanRestart.getData().duration)}ms`)}.`,
                  attributes: { agentName, instanceCount },
                });
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
        return op.failure({ code: "Unknown", error });
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
        return op.failure({ code: "Unknown", error });
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
          error,
        });
      }
    });
  }

  server = {
    //
    available: async () => {
      return await this.telemetry.trace("server.available()", async () => {
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
          return op.failure({ code: "Unknown", message: "Failed to get server info", error });
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
              name: process.name,
              status: process.status,
              lastStartedAt: process.lastStartedAt,
            })),
          );
        } catch (error) {
          return op.failure({ code: "Unknown", error });
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
          return op.failure({ code: "Unknown", message: "Failed to get server info", error });
        }
      });
    },
  };

  agent = {
    //
    create: async ({ id, name }: { id?: string; name: string }) => {
      return await this.telemetry.trace("agent.create()", async (span) => {
        try {
          // Ensure the request agent exists
          const build = await importServerBuild(true);
          const definition = build[name as keyof typeof build]?.definition;
          if (!definition)
            return op.failure({ code: "NotFound", message: `Agent '${name}' not found.` });

          // Create the agent process
          const process = new AgentProcess({ id, name, server: this });
          span.setAttributes({ id: process.id, name });

          // Add the agent process to the map
          this.agentProcesses.set(process.id, process);

          // Clean the agent process if not started after 10 minutes
          setTimeout(
            async () => {
              if (process.status === "stopped" && process.restartCount === 0) {
                await process.stop();
                this.agentProcesses.delete(process.id);
              }
            },
            10 * 60 * 1000,
          );

          // Return the agent's client-side config
          return op.success({
            id: process.id,
            clientConfig: agentServerConfig.schema
              .and(agentClientConfig.schema)
              .parse(definition.config),
          });
        } catch (error) {
          return op.failure({ code: "Unknown", error });
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
          const [errDefinition, definition] = await process.getDefinition();
          if (errDefinition) return op.failure(errDefinition);

          if (!(await definition.scope.hasAccess({ request, scope }))) {
            return op.failure({
              code: "Forbidden",
              message: `Access denied for agent '${process.name}'.`,
            });
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

          // Staet the process
          await this.telemetry.trace("start-process", async (spanStart) => {
            spanStart.setAttributes({ id, agentName: process.name });

            const [errStart] = await process.start({
              scope,
              transportRoom: { name: roomName, token: agentToken },
            });
            if (errStart) return op.failure(errStart);

            // Log operation with timing
            spanStart.end();
            const formattedName = chalk.bold.italic(process.name);
            span.log.info({
              message: `Started instance of '${formattedName}' in ${chalk.bold(`${ns.toMs(spanStart.getData().duration)}ms`)}.`,
              attributes: { id, agentName: process.name },
            });
          });

          return op.success({
            sessionToken: process.sessionToken,
            transportRoom: { name: roomName, token: userToken },
          });
        } catch (error) {
          return op.failure({
            code: "Unknown",
            message: `Failed to start agent process '${id}'.`,
            error,
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
          await this.telemetry.trace("stop-process", async (spanStop) => {
            spanStop.setAttributes({ id, agentName: process.name });

            // Stop the process
            const [errStop] = await process.stop();
            if (errStop) return op.failure(errStop);

            // Remove the process from the map
            this.agentProcesses.delete(process.id);

            // Log operation with timing
            spanStop.end();
            const formattedName = chalk.bold.italic(process.name);
            span.log.info({
              message: `Stopped instance of '${formattedName}' in ${chalk.bold(`${ns.toMs(spanStop.getData().duration)}ms`)}.`,
              attributes: { id, agentName: process.name },
            });
          });

          return op.success();
        } catch (error) {
          return op.failure({
            code: "Unknown",
            message: `Failed to stop agent process '${id}'.`,
            error,
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
          await this.telemetry.trace("restart-process", async (spanRestart) => {
            spanRestart.setAttributes({ id, agentName: process.name });

            // Restart the process
            const [errRestart] = await process.restart();
            if (errRestart) return op.failure(errRestart);

            // Log operation with timing
            spanRestart.end();
            const formattedName = chalk.bold.italic(process.name);
            span.log.info({
              message: `Restarted instance of '${formattedName}' in ${chalk.bold(`${ns.toMs(spanRestart.getData().duration)}ms`)}.`,
              attributes: { id, agentName: process.name },
            });
          });

          return op.success();
        } catch (error) {
          return op.failure({
            code: "Unknown",
            message: `Failed to restart agent process '${id}'.`,
            error,
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
          if (errPing) return op.failure(errPing);

          return op.success("pong");
        } catch (error) {
          return op.failure({
            code: "Unknown",
            message: `Failed to ping agent process '${id}'.`,
            error,
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
          if (errStats) return op.failure(errStats);

          return op.success({
            id,
            name: process.name,
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
            error,
          });
        }
      });
    },
  };
}
