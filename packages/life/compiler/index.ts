import { createHash } from "node:crypto";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path, { dirname, join, relative } from "node:path";
import { Lang, parseAsync } from "@ast-grep/napi";
import chalk from "chalk";
import chokidar, { type FSWatcher } from "chokidar";
import esbuild from "esbuild";
import { globbySync } from "globby";
import ts from "typescript";
import { deepClone } from "@/shared/deep-clone";
import { ns } from "@/shared/nanoseconds";
import * as op from "@/shared/operation";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/node";
import { getDependenciesMap } from "./helpers/dependencies-map";
import { type CompilerOptions, compilerOptionsSchema } from "./options";
import type { CompilerPathType } from "./types";

const EXCLUDED_DEFAULTS = ["**/node_modules/**", "**/build/**", "**/generated/**", "**/dist/**"];

export class LifeCompiler {
  options: CompilerOptions<"output">;
  hashes = new Map<string, string>();
  watcher: FSWatcher | null = null;

  paths = {
    configs: new Set<string>(),
    servers: new Set<string>(),
    clients: new Set<string>(),
    dependencies: new Map<string, Set<string>>(), // entryPath -> dependencies
    serverBuilds: new Map<string, string>(), // entryPath -> buildPath
    clientBuilds: new Map<string, string>(), // entryPath -> buildPath
  };

  // Language Service for faster type extraction
  telemetry: TelemetryClient;
  #serverBundleContext: esbuild.BuildContext | null = null;
  #languageService?: ts.LanguageService;
  #serviceHost?: ts.LanguageServiceHost;
  readonly #virtualFiles = new Map<string, string>();
  readonly #pluginNamesCache = new Map<string, { hash: string; names: string[] }>();

  constructor(options: CompilerOptions<"input">) {
    this.options = compilerOptionsSchema.parse(options);

    // Default stopOnError to false if watch mode and stopOnError is not provided
    if (this.options.watch && options?.stopOnError === undefined) {
      this.options.stopOnError = false;
    }

    // Initialize telemetry
    this.telemetry = createTelemetryClient("compiler", {
      watch: this.options.watch,
    });

    // Ensure outputDir is absolute
    this.options.outputDirectory = this.options.outputDirectory.startsWith("/")
      ? this.options.outputDirectory
      : join(this.options.projectDirectory, this.options.outputDirectory);
  }

  async start() {
    return await this.telemetry.trace("start()", async (span) => {
      try {
        span.log.info({ message: "Starting compiler." });
        span.log.debug({ message: `Project directory: ${this.options.projectDirectory}` });
        span.log.debug({ message: `Output directory: ${this.options.outputDirectory}` });
        this.telemetry.counter("compiler_started").increment();

        await this.telemetry.trace("initial-compilation", async (spanCompilation) => {
          // 1. Ensure the build directory exists and link the build directory output to life/build
          await Promise.all([this.ensureBuildDirectory(), this.linkBuildDirectory()]);

          // 2. Find all Life.js agents and config files, and their dependencies
          const entryPaths = globbySync(
            [
              "**/agent/{server.ts,client.ts}",
              "**/agents/*/{server.ts,client.ts}",
              "**/life.config.ts",
            ],
            {
              cwd: this.options.projectDirectory,
              ignore: EXCLUDED_DEFAULTS,
              dot: false,
              onlyFiles: true,
              absolute: true,
              gitignore: true,
              unique: true,
            },
          );
          await Promise.all(entryPaths.map(async (p) => this.refreshEntryPathDependencies(p)));

          // 3. Perform an initial compilation on entry paths
          // Compile configs first, so that agents can use them
          const configResults = await Promise.all(
            entryPaths
              .filter((p) => p.endsWith("life.config.ts"))
              .map(
                async (absPath) =>
                  await this.processFileEvent({
                    action: "added",
                    absPath,
                    type: "config",
                    noTimingLogs: true,
                  }),
              ),
          );
          // Compile agents servers and clients
          const agentResults = await Promise.all([
            ...entryPaths
              .filter((p) => p.endsWith("server.ts"))
              .map(
                async (absPath) =>
                  await this.processFileEvent({
                    action: "added",
                    absPath,
                    type: "server",
                    noTimingLogs: true,
                  }),
              ),
            ...entryPaths
              .filter((p) => p.endsWith("client.ts"))
              .map(
                async (absPath) =>
                  await this.processFileEvent({
                    action: "added",
                    absPath,
                    type: "client",
                    noTimingLogs: true,
                  }),
              ),
          ]);

          // 4. If some agents have been compiled, show the results
          const results = [...configResults, ...agentResults];
          spanCompilation.end();
          const duration = spanCompilation.getData().duration;
          const errorsCount = results.filter((r) => Boolean(r?.[0])).length;
          const hasAgents = entryPaths.filter((p) => p.endsWith("server.ts")).length > 0;
          if (hasAgents) {
            span.log.info({
              message: `Initial compilation in ${chalk.bold(`${ns.toMs(duration)}ms`)}. ${errorsCount > 0 ? chalk.red(`(${chalk.bold(errorsCount)} error${errorsCount > 1 ? "s" : ""})`) : chalk.dim("(no errors)")}`,
            });
          }
          // Else show a helpful message if no agent server paths are found
          else
            span.log.info({
              message:
                "No agent server to compile yet. Create a first `agent/server.ts` file in your project.",
            });
        });

        // 5. (if watch mode) Watch for changes in agents / configs files
        if (this.options.watch) {
          this.watchEntryPaths();
          span.log.info({ message: "Watching for changes..." });

          // Listen for SIGINT and SIGTERM to gracefully stop the compiler
          const handleShutdown = async (signal: string) => {
            console.log("");
            this.telemetry.log.info({ message: `Received ${signal}, shutting down gracefully...` });
            await this.stop();
          };
          process.once("SIGINT", () => handleShutdown("SIGINT"));
          process.once("SIGTERM", () => handleShutdown("SIGTERM"));
        }

        // 6. Or stop the compiler
        else await this.stop();

        // 7. Return success
        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", error });
      }
    });
  }

  #stopStarted = false;
  async stop() {
    return await this.telemetry.trace("stop()", async (span) => {
      if (this.#stopStarted) return;
      this.#stopStarted = true;
      span.log.info({ message: "Stopping compiler." });

      // Dispose all ESBuild contexts
      this.#serverBundleContext?.dispose();
      this.#serverBundleContext = null;

      // Stop the watcher
      this.watcher?.close();
      this.watcher = null;

      // Ensure telemetry consumers have finished processing
      await this.telemetry.flushConsumers();
    });
  }

  async ensureBuildDirectory() {
    await Promise.all([
      mkdir(path.join(this.options.outputDirectory, "server", "raw"), { recursive: true }),
      mkdir(path.join(this.options.outputDirectory, "server", "dist"), { recursive: true }),
      mkdir(path.join(this.options.outputDirectory, "client"), { recursive: true }),
    ]);
  }

  async linkBuildDirectory() {
    // Paths to generated build files in .life/build/
    const generatedClientPath = join(this.options.outputDirectory, "client", "index.ts");
    const generatedServerPath = join(this.options.outputDirectory, "server", "dist", "index.js");

    // Find node_modules and set up dist directory
    const nodeModulesPath = await this.findNodeModules(this.options.projectDirectory);
    const distDir = join(nodeModulesPath, "life/dist");

    // Get all files in the dist directory recursively
    const { glob } = await import("glob");
    const distFiles = await glob("**/*", {
      cwd: distDir,
      nodir: true,
      absolute: false,
    });

    // Process all files concurrently, replacing placeholders
    await Promise.all(
      distFiles.map(async (file) => {
        const filePath = join(distDir, file);
        const content = await readFile(filePath, "utf-8");

        // Replace placeholders
        // @dev '()' empty groups are used in regexes to avoid those mathching themselves.
        const clientPath = relative(dirname(filePath), generatedClientPath);
        const serverPath = relative(dirname(filePath), generatedServerPath);
        const updatedContent = content
          .replaceAll(/"LIFE()_CLIENT_BUILD_PATH"/g, `"${clientPath}"`)
          .replaceAll(/"LIFE()_SERVER_BUILD_PATH"/g, `"${serverPath}"`)
          .replaceAll(/"LIFE()_BUILD_MODE"/g, '"production"')
          .replaceAll(/'LIFE()_CLIENT_BUILD_PATH'/g, `'${clientPath}'`)
          .replaceAll(/'LIFE()_SERVER_BUILD_PATH'/g, `'${serverPath}'`)
          .replaceAll(/'LIFE()_BUILD_MODE'/g, "'production'");

        // Write back if content changed
        if (updatedContent !== content) await writeFile(filePath, updatedContent, "utf-8");
      }),
    );
  }

  async getPathDisplayName(
    _path: string,
    type: "config" | "server" | "client" | "dependency" | "unknown",
  ) {
    const relativePath = path.relative(this.options.projectDirectory, _path);
    if (["config", "dependency", "unknown"].includes(type)) return relativePath;

    // Else try to extract the agent name from the file
    const clientContent = await readFile(_path, "utf-8");
    const ast = await parseAsync(Lang.TypeScript, clientContent);
    const root = ast.root();
    const defineCall = root.find({
      rule: {
        kind: "call_expression",
        any: [
          { pattern: `defineAgent${type === "client" ? "Client" : ""}<$$$>($ARG)` },
          { pattern: `defineAgent${type === "client" ? "Client" : ""}($ARG)` },
        ],
      },
    });
    if (!defineCall) return relativePath;
    let name = defineCall?.getMatch("ARG")?.text() ?? null;
    if (name) name = JSON.parse(name) as string;
    else return relativePath;
    return name;
  }

  /**
   * Main compiler entry point. Used to process a file.
   * @param params - The parameters for the file event.
   * @returns The result of the file event.
   */
  async processFileEvent({
    type,
    action,
    absPath,
    noCache = false,
    noTimingLogs = false,
  }: {
    type: CompilerPathType;
    action: "added" | "removed" | "changed";
    absPath: string;
    noCache?: boolean;
    noTimingLogs?: boolean;
  }) {
    const result = await this.telemetry.trace("processFileEvent()", async (span) => {
      span.setAttributes({ action, relPath: absPath });

      // Helper to emit timing logs
      const emitTimingLogs = async (recompiled: boolean) => {
        if (noTimingLogs) return;
        if (!["server", "client"].includes(type)) return;
        span.end();
        const name = await this.getPathDisplayName(absPath, type);
        this.telemetry.log.info({
          message: `Agent ${type} '${chalk.bold.italic(name)}' ${recompiled ? "re-compiled" : "compiled"} in ${chalk.bold(`${ns.toMs(span.getData().duration)}ms`)}.`,
          attributes: { type, name },
        });
      };

      // Ensure the path is absolute
      absPath = this.ensureAbsolute(absPath);

      // Ignore unknown path type
      if (type === "unknown") return op.success();

      // Process the event
      // - Added
      if (action === "added") {
        // Compute the path hash
        this.hashes.set(absPath, await this.hashFile(absPath));
        // Telemetry
        span.log.debug({
          message: `Added '${type}' path: ${absPath}`,
          attributes: { path: absPath },
        });
        // Handle the path type
        if (type === "config") return await this.onAddedConfig(absPath);
        else if (type === "server") {
          const res = await this.onAddedServer(absPath);
          await emitTimingLogs(false);
          return res;
        } else if (type === "client") {
          const res = await this.onAddedClient(absPath);
          await emitTimingLogs(false);
          return res;
        } else if (type === "dependency")
          return op.failure({
            code: "Conflict",
            message: "'added' action is not supported for dependency paths. Shouldn't happen.",
          });
      }
      // - Removed
      else if (action === "removed") {
        // Clean up the path hash
        this.hashes.delete(absPath);
        // Telemetry
        span.log.debug({
          message: `Removed '${type}' path: ${absPath}`,
          attributes: { path: absPath },
        });
        // Handle the path type
        if (type === "config") return await this.onRemovedConfig(absPath);
        else if (type === "server") return await this.onRemovedServer(absPath);
        else if (type === "client") return await this.onRemovedClient(absPath);
        else if (type === "dependency") return await this.onRemovedDependency(absPath);
      }
      // - Changed
      else if (action === "changed") {
        // Return early if the hash hasn't changed
        const newHash = await this.hashFile(absPath);
        if (newHash === this.hashes.get(absPath) && !noCache) return op.success();
        this.hashes.set(absPath, newHash);
        // Telemetry
        span.log.debug({
          message: `Changed '${type}' path: ${absPath}`,
          attributes: { path: absPath },
        });
        // If not a dependency, refresh the dependencies
        if (type !== "dependency") await this.refreshEntryPathDependencies(absPath);
        // Handle the path type
        if (type === "config") return await this.onChangedConfig(absPath);
        else if (type === "server") {
          const res = await this.onChangedServer(absPath);
          await emitTimingLogs(true);
          return res;
        } else if (type === "client") {
          const res = await this.onChangedClient(absPath);
          await emitTimingLogs(true);
          return res;
        } else if (type === "dependency") return await this.onChangedDependency(absPath);
      }

      throw new Error("Invalid action. Shouldn't happen.");
    });

    // Handle any error
    const [error] = result;
    if (error) {
      // Build the base error message
      const displayName = await this.getPathDisplayName(absPath, type);
      let baseMessage = "Failed to compile ";
      if (["client", "server"].includes(type))
        baseMessage += `agent ${type} '${chalk.bold.italic(displayName)}'.`;
      else baseMessage += `'${chalk.bold.italic(displayName)}' ${type} file.`;
      const relativePath = path.relative(this.options.projectDirectory, absPath);

      // If requested, log and stop the compiler on error
      if (this.options.stopOnError) {
        this.telemetry.log.error({ message: `${baseMessage}\nPath: ${relativePath}`, error });
        await this.stop();
      }
      // Else gracefully warn and ignore the file
      else
        this.telemetry.log.warn({
          message: `${baseMessage} It has been ignored.\nPath: ${relativePath}`,
          error,
        });
    }
    return result;
  }

  // Configs Events Handlers

  async onAddedConfig(configPath: string) {
    return await this.telemetry.trace(
      "onAddedConfig()",
      async () => {
        try {
          // Add the config to the configs paths array
          this.paths.configs.add(configPath);

          // Call the change handler
          return await this.onChangedConfig(configPath);
        } catch (error) {
          return op.failure({ code: "Unknown", error });
        }
      },
      { attributes: { configPath } },
    );
  }

  async onRemovedConfig(configPath: string) {
    return await this.telemetry.trace(
      "onRemovedConfig()",
      async () => {
        try {
          // Remove the config from the configs paths array
          this.paths.configs.delete(configPath);

          // Call the change handler
          return await this.onChangedConfig(configPath);
        } catch (error) {
          return op.failure({ code: "Unknown", error });
        }
      },
      { attributes: { configPath } },
    );
  }

  async onChangedConfig(configPath: string) {
    return await this.telemetry.trace(
      "onChangedConfig()",
      async () => {
        try {
          // 1. Ensure the config contains a defineConfig() call
          const configContent = await readFile(configPath, "utf-8");
          const ast = await parseAsync(Lang.TypeScript, configContent);
          const root = ast.root();
          const defineConfigCall = root.find({
            rule: { kind: "call_expression", pattern: "defineConfig($ARG)" },
          });
          if (!defineConfigCall) {
            return op.failure({
              code: "Validation",
              message: "Config file does not contain a defineConfig() call.",
              attributes: { path: configPath },
            });
          }

          // 2. Ensure the defineConfig() call is exported as default
          const exportDefaultStatement = root.find({
            rule: {
              kind: "export_statement",
              pattern: "export default",
              has: {
                regex: "defineConfig(.*)",
              },
            },
          });
          if (!exportDefaultStatement) {
            return op.failure({
              code: "Validation",
              message: `Config file has defineConfig() but doesn't export it as default. Use \`export default defineConfig(...)\` instead.`,
              attributes: { path: configPath },
            });
          }

          // 4. Recompiling affected agents servers
          const affected = Array.from(this.paths.servers).filter((p) =>
            this.isEntryPathTouchedByConfig(p, configPath),
          );
          await Promise.all(
            affected.map(async (serverPath) => {
              const absPath = this.ensureAbsolute(serverPath);
              return await this.processFileEvent({
                action: "changed",
                absPath,
                type: "server",
                noCache: true,
              });
            }),
          );

          return op.success();
        } catch (error) {
          return op.failure({ code: "Unknown", error });
        }
      },
      { attributes: { configPath } },
    );
  }

  // Agent Servers Events Handlers

  async onAddedServer(serverPath: string) {
    return await this.telemetry.trace(
      "onAddedServer()",
      async () => {
        try {
          // Add the server to the servers paths array
          this.paths.servers.add(serverPath);

          // Call the change handler
          return await this.onChangedServer(serverPath);
        } catch (error) {
          return op.failure({ code: "Unknown", error });
        }
      },
      { attributes: { serverPath } },
    );
  }

  async onRemovedServer(serverPath: string) {
    return await this.telemetry.trace(
      "onRemovedServer()",
      async () => {
        try {
          // Remove the server from the servers paths array
          this.paths.servers.delete(serverPath);

          // Find and remove the server build path
          const buildPath = this.paths.serverBuilds.get(serverPath);
          if (buildPath) {
            this.paths.serverBuilds.delete(serverPath);
            await rm(buildPath);
          }

          // Request a rebuild of the server bundle
          return await this.generateServerBundle();
        } catch (error) {
          return op.failure({ code: "Unknown", error });
        }
      },
      { attributes: { serverPath } },
    );
  }

  async onChangedServer(serverPath: string) {
    return await this.telemetry.trace(
      "onChangedServer()",
      async (span) => {
        try {
          // 1. Ensure the server file contains a defineAgent() call
          const serverContent = await readFile(serverPath, "utf-8");
          const ast = await parseAsync(Lang.TypeScript, serverContent);
          const root = ast.root();
          const defineAgentCall = root.find({
            rule: { kind: "call_expression", pattern: "defineAgent($ARG)" },
          });
          if (!defineAgentCall) {
            return op.failure({
              code: "Validation",
              message: `Agent server '${chalk.bold.italic(path.relative(this.options.projectDirectory, serverPath))}' doesn't contain a ${chalk.bold.italic("defineAgent(...)")} call.`,
              attributes: { serverPath },
            });
          }

          // 2. Ensure the defineAgent() call is exported as default
          const exportDefaultStatement = root.find({
            rule: {
              kind: "export_statement",
              pattern: "export default",
              has: {
                regex: "defineAgent(.*)",
              },
            },
          });
          if (!exportDefaultStatement) {
            return op.failure({
              code: "Validation",
              message: `Agent server '${chalk.bold.italic(path.relative(this.options.projectDirectory, serverPath))}' doesn't export ${chalk.bold.italic("defineAgent(...)")} call as default. Use ${chalk.bold.italic("export default defineAgent(...)")}.`,
              attributes: { serverPath },
            });
          }

          // 3. Retrieve the agent name
          let name = defineAgentCall?.getMatch("ARG")?.text() ?? null;
          if (name) name = JSON.parse(name) as string;
          if (!name) {
            return op.failure({
              code: "Validation",
              message: `Agent server '${chalk.bold.italic(name)}' has ${chalk.bold.italic("defineAgent()")} but doesn't provide a name. Use ${chalk.bold.italic("defineAgent(<name>)")}.`,
              attributes: { serverPath },
            });
          }

          // 4. Retrieve all the configs touching this server
          const configPaths: string[] = [];
          for (const configPath of this.paths.configs) {
            if (this.isEntryPathTouchedByConfig(serverPath, configPath))
              configPaths.push(configPath);
          }
          configPaths.sort((a, b) => b.length - a.length);

          // 5. Obtain a unified sha of the server file dependencies tree
          const treeFiles = new Set<string>([serverPath, ...configPaths]);
          // - Add all dependencies from the dependenciesMap
          for (const file of deepClone(treeFiles)) {
            const deps = this.paths.dependencies.get(file);
            if (deps) for (const dep of deps) treeFiles.add(dep);
          }
          // - Obtain the hashes for all tree files
          const treeHashes = Array.from(treeFiles).map((file) => this.hashes.get(file));
          const filteredTreeHashes = treeHashes.filter((hash) => hash !== undefined);

          if (treeHashes.length !== filteredTreeHashes.length) {
            span.log.warn({
              message:
                "Some tree files have no hash. Shouldn't happen." +
                JSON.stringify(Array.from(treeFiles)) +
                JSON.stringify(treeHashes) +
                JSON.stringify(filteredTreeHashes),
              attributes: { treeFiles },
            });
          }
          // - Compute the unified hash from all tree hashes
          const sha = createHash("md5").update(treeHashes.join(":")).digest("hex");

          // 6. Generate agent server build content
          const buildPath = path.join(this.options.outputDirectory, "server", "raw", `${name}.ts`);
          const relServerPath = path.relative(path.dirname(buildPath), serverPath);
          const relConfigPaths = configPaths.map((configPath) =>
            path.relative(path.dirname(buildPath), configPath),
          );
          const content = `
        ${relConfigPaths.map((configPath, i) => `import config${i} from "${configPath}";`).join("\n")}
import agent from "${relServerPath}";
export default {
  definition: agent._definition,
  globalConfigs: [${configPaths.map((_, i) => `config${i}`).join(", ")}],
  sha: "${sha}"
} as const;
        `.trim();

          // 7. Write the agent server build content
          await writeFile(buildPath, content, "utf-8");
          this.paths.serverBuilds.set(serverPath, buildPath);

          // 8. Re-bundle the server index
          const [errBundle] = await this.generateServerBundle();
          if (errBundle) return op.failure(errBundle);

          return op.success();
        } catch (error) {
          return op.failure({ code: "Unknown", error });
        }
      },
      { attributes: { serverPath } },
    );
  }

  // Agent Clients Events Handlers

  async onAddedClient(clientPath: string) {
    return await this.telemetry.trace(
      "onAddedClient()",
      async () => {
        try {
          // Add the client to the clients paths array
          this.paths.clients.add(clientPath);

          // Call the change handler
          return await this.onChangedClient(clientPath);
        } catch (error) {
          return op.failure({ code: "Unknown", error });
        }
      },
      { attributes: { clientPath } },
    );
  }

  async onRemovedClient(clientPath: string) {
    return await this.telemetry.trace(
      "onRemovedClient()",
      async () => {
        try {
          // Remove the client from the clients paths array
          this.paths.clients.delete(clientPath);

          // Find and remove the client build path
          const buildPath = this.paths.clientBuilds.get(clientPath);
          if (buildPath) {
            this.paths.clientBuilds.delete(clientPath);
            await rm(buildPath);
          }

          // Request a rebuild of the client bundle
          return await this.onChangedClient(clientPath);
        } catch (error) {
          return op.failure({ code: "Unknown", error });
        }
      },
      { attributes: { clientPath } },
    );
  }

  async onChangedClient(clientPath: string) {
    return await this.telemetry.trace(
      "onChangedClient()",
      async () => {
        try {
          // 1. Ensure the client file contains a defineAgentClient() call
          const clientContent = await readFile(clientPath, "utf-8");
          const ast = await parseAsync(Lang.TypeScript, clientContent);
          const root = ast.root();
          const defineAgentClientCall = root.find({
            rule: {
              kind: "call_expression",
              any: [
                { pattern: "defineAgentClient<$$$>($ARG)" },
                { pattern: "defineAgentClient($ARG)" },
              ],
            },
          });
          if (!defineAgentClientCall) {
            return op.failure({
              code: "Validation",
              message: `Agent client '${chalk.bold.italic(path.relative(this.options.projectDirectory, clientPath))}' doesn't contain a ${chalk.bold.italic("defineAgentClient(...)")} call. It has been ignored.`,
              attributes: { clientPath },
            });
          }

          // 2. Ensure the defineAgentClient() call is exported as default
          const exportDefaultStatement = root.find({
            rule: {
              kind: "export_statement",
              pattern: "export default",
              has: {
                regex: "defineAgentClient(<.*>)?(.*)",
              },
            },
          });
          if (!exportDefaultStatement) {
            return op.failure({
              code: "Validation",
              message: `Agent client '${chalk.bold.italic(path.relative(this.options.projectDirectory, clientPath))}' doesn't export ${chalk.bold.italic("defineAgentClient(...)")} call as default. It has been ignored. Use ${chalk.bold.italic("export default defineAgentClient(...)")}.`,
              attributes: { clientPath },
            });
          }

          // 3. Retrieve the agent name
          let name = defineAgentClientCall?.getMatch("ARG")?.text() ?? null;
          if (name) name = JSON.parse(name) as string;
          if (!name) {
            return op.failure({
              code: "Validation",
              message: `Agent client '${chalk.bold.italic(path.relative(this.options.projectDirectory, clientPath))}' has ${chalk.bold.italic("defineAgentClient()")} but doesn't provide a name. It has been ignored. Use ${chalk.bold.italic("defineAgentClient(<name>)")}.`,
              attributes: { clientPath },
            });
          }

          // 4. Retrieve all the names of the plugins registered on this agent client
          const pluginNames = await this.extractClientPluginNames(clientPath);

          // 5. Generate agent client build content
          const pluginEntries = pluginNames
            .map((pluginName) => {
              return `    ${pluginName}: {
        class: agentClient._definition.plugins["${pluginName}"].class<
        typeof agentClient._definition.$serverDef.pluginConfigs["${pluginName}"],
        typeof agentClient._definition.pluginConfigs["${pluginName}"]
      >(),
        definition: agentClient._definition.plugins["${pluginName}"]
      }`;
            })
            .join(",\n");

          const buildPath = path.join(this.options.outputDirectory, "client", `${name}.ts`);
          const relClientPath = path.relative(path.dirname(buildPath), clientPath);
          const content = `import agentClient from "${relClientPath.replace(".ts", "")}";
export default {
  definition: agentClient._definition,
  plugins: {
${pluginEntries}
  }
} as const;
        `.trim();

          // 6. Write the agent client build content
          await writeFile(buildPath, content, "utf-8");
          this.paths.clientBuilds.set(clientPath, buildPath);

          // 7. Re-bundle the client index
          const [errBundle] = await this.generateClientBundle();
          if (errBundle) return op.failure(errBundle);

          return op.success();
        } catch (error) {
          return op.failure({ code: "Unknown", error });
        }
      },
      { attributes: { clientPath } },
    );
  }

  // Dependency Paths Events Handlers

  async onRemovedDependency(dependencyPath: string) {
    return await this.telemetry.trace(
      "onRemovedDependency()",
      async () => {
        try {
          // Call the change handler
          return await this.onChangedDependency(dependencyPath);
        } catch (error) {
          return op.failure({ code: "Unknown", error });
        }
      },
      { attributes: { dependencyPath } },
    );
  }

  async onChangedDependency(dependencyPath: string) {
    return await this.telemetry.trace(
      "onChangedDependency()",
      async () => {
        try {
          // Find the affected entry paths
          const affected = new Set<string>();
          for (const [entryPath, dependencies] of this.paths.dependencies) {
            if (dependencies.has(dependencyPath)) affected.add(entryPath);
          }

          // Recompile the affected entry paths
          await Promise.all(
            Array.from(affected).map((p) => {
              const absPath = this.ensureAbsolute(p);
              const type = this.getPathType(absPath);
              return this.processFileEvent({ action: "changed", absPath, type, noCache: true });
            }),
          );

          return op.success();
        } catch (error) {
          return op.failure({ code: "Unknown", error });
        }
      },
      { attributes: { dependencyPath } },
    );
  }

  watchEntryPaths() {
    return this.telemetry.trace("watchEntryPaths()", () => {
      // Watch for files changes in the project directory
      this.watcher = chokidar.watch(".", {
        cwd: this.options.projectDirectory,
        ignoreInitial: true,
        ignored: EXCLUDED_DEFAULTS,
        awaitWriteFinish: {
          stabilityThreshold: 20,
          pollInterval: 5,
        },
      });

      // Helper function to receive watcher events
      const onWatcherEventFn = (action: "added" | "removed" | "changed") => {
        return (p: string) => {
          const absPath = this.ensureAbsolute(p);
          const type = this.getPathType(absPath);
          this.processFileEvent({ action, absPath, type });
        };
      };

      this.watcher.on("add", onWatcherEventFn("added"));
      this.watcher.on("unlink", onWatcherEventFn("removed"));
      this.watcher.on("change", onWatcherEventFn("changed"));
    });
  }

  async refreshEntryPathDependencies(entryPath: string) {
    const absPath = this.ensureAbsolute(entryPath);

    // If this is a client path, exclude the server path
    const exclude: string[] = [];
    if (this.getPathType(absPath) === "client") {
      exclude.push(absPath.replace("/client.ts", "/server.ts"));
    }

    const [error, dependencies] = await getDependenciesMap(absPath, exclude, true);
    if (error) {
      this.telemetry.log.error({
        message: "Obtaining entry path dependencies failed.",
        error,
        attributes: { entryPath },
      });
      return;
    }
    // Store the dependencies for this entry path
    this.paths.dependencies.set(entryPath, new Set(dependencies));

    // Hash all the dependencies
    await Promise.all(dependencies.map(async (d) => this.hashes.set(d, await this.hashFile(d))));
  }

  getPathType(absPath: string): CompilerPathType {
    const pathParts = absPath.split("/");
    const parentDir = pathParts.at(-2);
    const grandParentDir = pathParts.at(-3);

    if (absPath.endsWith("/life.config.ts")) return "config";
    else if (
      // Match only agent/* or agents/<name>/*
      (parentDir === "agent" || grandParentDir === "agents") &&
      // Exclude false positives if a plugins folder is present at the root of agents/
      !absPath.includes("/plugins/")
    ) {
      if (absPath.endsWith("/server.ts")) return "server";
      else if (absPath.endsWith("/client.ts")) return "client";
    }

    // Check if this path is a dependency of any entry path
    for (const dependencies of this.paths.dependencies.values()) {
      if (dependencies.has(absPath)) return "dependency";
    }

    return "unknown";
  }

  ensureAbsolute(p: string) {
    return path.resolve(this.options.projectDirectory, p);
  }

  async hashFile(filePath: string) {
    const content = await readFile(filePath, "utf-8");
    return createHash("md5").update(content).digest("hex");
  }

  isEntryPathTouchedByConfig(entryPath: string, configPath: string): boolean {
    const configDir = path.dirname(configPath);
    const relativePath = path.relative(configDir, entryPath);
    return !relativePath.startsWith("..");
  }

  async findNodeModules(startPath: string) {
    let currentDir = startPath;

    while (currentDir !== "/") {
      const nodeModulesPath = join(currentDir, "node_modules");
      // biome-ignore lint/performance/noAwaitInLoops: no other choice here
      if (await this.fileExists(nodeModulesPath)) {
        this.telemetry.log.debug({ message: `node_modules path: ${nodeModulesPath}` });
        return nodeModulesPath;
      }
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;
      currentDir = parentDir;
    }

    throw new Error(
      "Could not find node_modules directory. Please ensure dependencies are installed.",
    );
  }

  // -------------------------------------

  async generateServerBundle() {
    return await this.telemetry.trace("generateServerBundle()", async () => {
      try {
        // 1. Generate a map of server names to their paths
        const serversMap: Record<string, string> = {};
        for (const serverPath of this.paths.serverBuilds.values()) {
          const name = path.basename(serverPath, ".ts");
          serversMap[name] = serverPath;
        }

        // 2. Produce the raw bundle index file
        const indexPath = path.join(this.options.outputDirectory, "server", "raw", "index.ts");
        const indexContent = `${Object.entries(serversMap)
          .map(
            ([name, p]) =>
              `import ${name} from "./${path.relative(path.dirname(indexPath), p).replace(".ts", "")}";`,
          )
          .join("\n")}
export default {
  ${Object.keys(serversMap)
    .map((name) => `"${name}": ${name}`)
    .join(",\n")}
}
  `.trim();
        await writeFile(indexPath, indexContent, "utf-8");

        // 3. Use ESBuild to bundle the raw index
        if (this.#serverBundleContext) await this.#serverBundleContext.cancel();
        else {
          this.#serverBundleContext = await esbuild.context({
            entryPoints: [indexPath],
            outdir: path.join(this.options.outputDirectory, "server", "dist"),
            bundle: true,
            format: "esm",
            platform: "node",
            target: "node20",
            packages: "external",
            keepNames: true,
            jsx: "automatic",
            write: true,
            logLevel: "silent",
            treeShaking: true,
            loader: {
              ".node": "file",
            },
            minify: true,
          });
        }
        await this.#serverBundleContext.rebuild();

        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", error });
      }
    });
  }

  async generateClientBundle() {
    return await this.telemetry.trace("generateClientBundle()", async () => {
      try {
        // 1. Generate a map of client names to their paths
        const clientsMap: Record<string, string> = {};
        for (const clientPath of this.paths.clientBuilds.values()) {
          const name = path.basename(clientPath, ".ts");
          clientsMap[name] = clientPath;
        }

        // 2. Produce the raw bundle index file
        const indexPath = path.join(this.options.outputDirectory, "client", "index.ts");
        const indexContent = `${Object.entries(clientsMap)
          .map(
            ([name, p]) =>
              `import ${name} from "./${path.relative(path.dirname(indexPath), p).replace(".ts", "")}";`,
          )
          .join("\n")}
export default {
  ${Object.keys(clientsMap)
    .map((name) => `"${name}": ${name}`)
    .join(",\n")}
}
  `.trim();
        await writeFile(indexPath, indexContent, "utf-8");

        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", error });
      }
    });
  }

  async fileExists(filePath: string) {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private readonly fileVersions = new Map<string, number>();

  private initLanguageService() {
    if (this.#languageService) return;

    const configPath = ts.findConfigFile(
      this.options.projectDirectory,
      ts.sys.fileExists,
      "tsconfig.json",
    );
    if (!configPath) return;

    const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
    const parsedConfig = ts.parseJsonConfigFileContent(
      config,
      ts.sys,
      this.options.projectDirectory,
    );

    // Optimize for performance
    parsedConfig.options.skipLibCheck = true;
    parsedConfig.options.skipDefaultLibCheck = true;

    this.#serviceHost = {
      getScriptFileNames: () => Array.from(this.#virtualFiles.keys()),
      getScriptVersion: (fileName: string) => {
        // Return version number that increments on each change
        return String(this.fileVersions.get(fileName) || 1);
      },
      getScriptSnapshot: (fileName: string) => {
        // Check virtual files first
        const virtualContent = this.#virtualFiles.get(fileName);
        if (virtualContent) {
          return ts.ScriptSnapshot.fromString(virtualContent);
        }
        // Fall back to file system
        const content = ts.sys.readFile(fileName);
        return content ? ts.ScriptSnapshot.fromString(content) : undefined;
      },
      getCurrentDirectory: () => this.options.projectDirectory,
      getCompilationSettings: () => parsedConfig.options,
      getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
      fileExists: ts.sys.fileExists,
      readFile: ts.sys.readFile,
      readDirectory: ts.sys.readDirectory,
      directoryExists: ts.sys.directoryExists,
      getDirectories: ts.sys.getDirectories,
    };

    this.#languageService = ts.createLanguageService(
      this.#serviceHost,
      ts.createDocumentRegistry(),
    );
  }

  private async extractPluginsArray(content: string): Promise<string | null> {
    const ast = await parseAsync(Lang.TypeScript, content);
    const root = ast.root();

    // Find .plugins() call
    const calls = root.findAll({ rule: { kind: "call_expression" } });
    // biome-ignore lint/suspicious/noExplicitAny: reason
    const pluginsCall = calls.find((call: any) => call.text().includes(".plugins("));
    if (!pluginsCall) return null;

    // Extract array argument
    const arrayArg = pluginsCall.find({ rule: { kind: "array" } });
    return arrayArg?.text() || null;
  }

  private async extractImports(content: string): Promise<string> {
    const ast = await parseAsync(Lang.TypeScript, content);
    const root = ast.root();

    const imports = root.findAll({ rule: { kind: "import_statement" } });
    // biome-ignore lint/suspicious/noExplicitAny: reason
    return imports.map((stmt: any) => stmt.text()).join("\n");
  }

  private findTypeAlias(node: ts.Node): ts.TypeAliasDeclaration | null {
    if (ts.isTypeAliasDeclaration(node) && node.name.text === "__ExtractedPlugins") {
      return node;
    }

    let result: ts.TypeAliasDeclaration | null = null;
    ts.forEachChild(node, (child: ts.Node) => {
      if (!result) result = this.findTypeAlias(child);
    });
    return result;
  }

  private extractUnionMembers(type: ts.Type): string[] {
    if (!type.isUnion()) return [];

    const names: string[] = [];
    for (const member of (type as ts.UnionType).types) {
      if (member.isStringLiteral()) {
        names.push((member as ts.StringLiteralType).value);
      }
    }
    return names;
  }

  async extractClientPluginNames(clientPath: string): Promise<string[]> {
    try {
      // Initialize language service once
      if (!this.#languageService) {
        this.initLanguageService();
        if (!this.#languageService) return [];
      }

      // Extract plugins array from source
      const content = await readFile(clientPath, "utf-8");
      const pluginsArray = await this.extractPluginsArray(content);
      if (!pluginsArray) return [];

      // Check cache
      const hash = createHash("md5").update(pluginsArray).digest("hex");
      const cached = this.#pluginNamesCache.get(clientPath);
      if (cached?.hash === hash) return cached.names;

      // Build minimal TypeScript content
      const imports = await this.extractImports(content);
      const virtualContent = `${imports}

const plugins = ${pluginsArray} as const;
type __ExtractedPlugins = typeof plugins[number]["_definition"]["name"];`;

      // Update virtual file
      this.#virtualFiles.set(clientPath, virtualContent);
      const version = (this.fileVersions.get(clientPath) || 0) + 1;
      this.fileVersions.set(clientPath, version);

      // Get type information
      const program = this.#languageService.getProgram();
      if (!program) return [];

      const sourceFile = program.getSourceFile(clientPath);
      if (!sourceFile) return [];

      const typeAlias = this.findTypeAlias(sourceFile);
      if (!typeAlias) return [];

      const type = program.getTypeChecker().getTypeAtLocation(typeAlias.type || typeAlias);
      const pluginNames = this.extractUnionMembers(type);

      // Cache result
      this.#pluginNamesCache.set(clientPath, { hash, names: pluginNames });
      return pluginNames;
    } catch (error) {
      this.telemetry.log.debug({
        message: "Failed to extract plugin names via type analysis",
        error,
        attributes: { clientPath },
      });
      return [];
    }
  }
}
