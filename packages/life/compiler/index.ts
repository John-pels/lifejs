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
import { lifeTelemetry } from "@/telemetry/client";
import { type CompilerOptions, compilerOptionsSchema } from "./options";

const EXCLUDED_DEFAULTS = ["**/node_modules/**", "**/build/**", "**/generated/**", "**/dist/**"];

export class LifeCompiler {
  options: CompilerOptions<"output">;
  entryPaths = {
    servers: [] as string[],
    clients: [] as string[],
    configs: [] as string[],
    dependenciesMap: new Map<string, Set<string>>(),
    get all() {
      return [
        ...this.servers,
        ...this.clients,
        ...this.configs,
        ...Array.from(this.dependenciesMap.values()).map((v) => Array.from(v).flat()),
      ];
    },
  };
  hashes = new Map<string, string>();
  watcher: FSWatcher | null = null;
  buildIndex = {
    configs: new Set<string>(),
    servers: new Set<string>(),
    clients: new Set<string>(),
  };
  telemetry = lifeTelemetry.child("compiler");
  serverBundleContext: esbuild.BuildContext | null = null;

  // Language Service for faster type extraction
  private languageService?: ts.LanguageService;
  private serviceHost?: ts.LanguageServiceHost;
  readonly virtualFiles = new Map<string, string>();
  readonly pluginNamesCache = new Map<string, { hash: string; names: string[] }>();

  constructor(options: CompilerOptions<"input">) {
    this.options = compilerOptionsSchema.parse(options);

    // Ensure outputDir is absolute
    this.options.outputDirectory = this.options.outputDirectory.startsWith("/")
      ? this.options.outputDirectory
      : join(this.options.projectDirectory, this.options.outputDirectory);
  }

  async start() {
    // Telemetry
    using h0 = (await this.telemetry.trace("start()")).start();
    h0.log.info({ message: "Starting compiler." });
    h0.log.debug({ message: `Optimized build: ${this.options.optimize}` });
    h0.log.debug({ message: `Project directory: ${this.options.projectDirectory}` });
    h0.log.debug({ message: `Output directory: ${this.options.outputDirectory}` });

    // 1. Reset and link the build directory output to life/build
    await Promise.all([this.resetOutputDirectory(), this.linkBuildDirectory()]);

    // 2. Make an initial exploration of all entry paths
    await this.initEntryPaths();

    // 3. Return early if no agents servers are found yet.
    if (!this.entryPaths.servers.length) {
      h0.log.info({
        message: "Nothing to compile yet. Create a first `agent/server.ts` file in your project.",
      });
      return;
    }

    // 4. Start an initial compilation of all agents
    using h1 = (await this.telemetry.trace("initial-compilation")).start();
    await Promise.all(this.entryPaths.configs.map((p) => this.compileConfig(p, false))); // configs are compiled first, because required by agents compilations
    await Promise.all([
      ...this.entryPaths.servers.map((p) => this.compileAgentServer(p)),
      ...this.entryPaths.clients.map((p) => this.compileAgentClient(p)),
    ]);
    await Promise.all([this.generateServerBundle(), this.generateClientBundle()]);
    h1.end();
    h0.log.info({
      message: `Agents compiled in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
    });

    // 5. Watch for new/deleted entry paths if watch mode is enabled
    if (this.options.watch) {
      this.watchEntryPaths();
      h0.log.info({ message: "Watching for changes..." });

      // 4. Listen for SIGINT and SIGTERM to gracefully stop the compiler
      const handleShutdown = async (signal: string) => {
        console.log("");
        this.telemetry.log.info({ message: `Received ${signal}, shutting down gracefully...` });
        await this.stop();
      };
      process.once("SIGINT", () => handleShutdown("SIGINT"));
      process.once("SIGTERM", () => handleShutdown("SIGTERM"));
    }
    // Else stop the compiler
    else await this.stop();

    // Telemetry
    this.telemetry.counter("compiler_started").increment();
  }

  #stopStarted = false;
  async stop() {
    if (this.#stopStarted) return;
    this.#stopStarted = true;

    using h0 = (await this.telemetry.trace("stop()")).start();
    h0.log.info({ message: "Stopping compiler." });

    // Dispose all ESBuild contexts
    this.serverBundleContext?.dispose();
    this.serverBundleContext = null;

    // Stop the watcher
    this.watcher?.close();
    this.watcher = null;

    // Ensure telemetry consumers have finished processing
    await this.telemetry.flush();
  }

  isEntryPath(absPath: string) {
    if (absPath.endsWith("/life.config.ts")) return "config";
    // Check if this path is a dependency of any entry path
    for (const dependencies of this.entryPaths.dependenciesMap.values()) {
      if (dependencies.has(absPath)) return "dependency";
    }

    const pathParts = absPath.split("/");
    const parentDir = pathParts.at(-2);
    const grandParentDir = pathParts.at(-3);

    if (parentDir === "agent" || grandParentDir === "agents") {
      if (absPath.endsWith("/server.ts")) return "server";
      if (absPath.endsWith("/client.ts")) return "client";
    }

    return false;
  }

  async initEntryPaths() {
    using h0 = (await this.telemetry.trace("initEntryPaths()")).start();

    // Retrieve all entry paths
    const entryPaths = globbySync(
      ["**/agent/{server.ts,client.ts}", "**/agents/*/{server.ts,client.ts}", "**/life.config.ts"],
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
    this.entryPaths.servers = entryPaths.filter((p) => p.endsWith("server.ts"));
    this.entryPaths.clients = entryPaths.filter((p) => p.endsWith("client.ts"));
    this.entryPaths.configs = entryPaths.filter((p) => p.endsWith("life.config.ts"));
    h0.setAttributes({
      serverPathsCount: this.entryPaths.servers.length,
      clientPathsCount: this.entryPaths.clients.length,
      configPathsCount: this.entryPaths.configs.length,
    });

    // Retrieve all dependencies and store them with entry paths as keys
    const allEntryPaths = [
      ...this.entryPaths.servers,
      ...this.entryPaths.clients,
      ...this.entryPaths.configs,
    ];
    const allDependencies = new Set<string>();

    await Promise.all(
      allEntryPaths.map(async (entryPath) => {
        const dependencies = await this.getPathDependencies(entryPath);
        // Store entryPath -> dependencies mapping
        this.entryPaths.dependenciesMap.set(entryPath, new Set(dependencies));
        // Collect all unique dependencies
        for (const dep of dependencies) allDependencies.add(dep);
      }),
    );

    // Obtain hashes for all entry paths and their dependencies
    const allPathsToHash = [...allEntryPaths, ...Array.from(allDependencies)];
    await Promise.all(
      allPathsToHash.map(async (hashedPath) => {
        const hash = await this.hashFile(hashedPath);
        this.hashes.set(hashedPath, hash);
      }),
    );
  }

  watchEntryPaths() {
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

    // Callback when entry path is added/removed/changed
    const processWatchEvent = async (action: "added" | "removed" | "changed", relPath: string) => {
      using h0 = (await this.telemetry.trace("processWatchEvent()", { action, relPath })).start();

      // Ensure the path is absolute
      const absPath = this.ensureAbsolute(relPath);

      // Identify whether it's a config or agent path
      const pathType = this.isEntryPath(absPath);
      if (!pathType) return;

      // If it's a changed, return early if the hash hasn't changed
      if (action === "changed") {
        const newHash = await this.hashFile(absPath);
        if (newHash === this.hashes.get(absPath)) return;
        this.hashes.set(absPath, newHash);
      }

      // Telemetry
      this.telemetry.log.debug({
        message: `${action.charAt(0).toUpperCase() + action.slice(1)} '${pathType}' path: ${relPath}`,
        attributes: { path: absPath },
      });

      // Refresh the dependencies for this entry path
      const refreshEntryPathDependencies = async (entryPath: string) => {
        const dependencies = await this.getPathDependencies(entryPath);
        // Store the dependencies for this entry path
        this.entryPaths.dependenciesMap.set(entryPath, new Set(dependencies));
        // Hash all the dependencies
        await Promise.all(
          dependencies.map(async (d) => this.hashes.set(d, await this.hashFile(d))),
        );
      };

      // Remove the dependencies for this entry path
      const removeEntryPathDependencies = (entryPath: string) => {
        // Get the dependencies for this entry path
        const dependencies = this.entryPaths.dependenciesMap.get(entryPath);
        // Check if any other entry path uses these dependencies
        for (const dependency of dependencies ?? []) {
          let stillUsed = false;
          for (const [otherPath, otherDeps] of this.entryPaths.dependenciesMap) {
            if (otherPath !== entryPath && otherDeps.has(dependency)) {
              stillUsed = true;
              break;
            }
          }
          // Remove hash only if no other entry path uses this dependency
          if (!stillUsed) this.hashes.delete(dependency);
        }
        // Remove the entry path's dependencies
        this.entryPaths.dependenciesMap.delete(entryPath);
      };

      // Process config paths
      if (pathType === "config") {
        // - Added
        if (action === "added") {
          // Add the config to the configs paths array
          this.entryPaths.configs.push(absPath);
          // Add all dependencies that belong to this config
          await refreshEntryPathDependencies(absPath);
          // Hash the config
          this.hashes.set(absPath, await this.hashFile(absPath));
          // Compile the config
          await this.compileConfig(absPath);
        }
        // - Removed
        else if (action === "removed") {
          this.entryPaths.configs = this.entryPaths.configs.filter((p) => p !== absPath);
          // Remove all dependencies that belong to this config
          removeEntryPathDependencies(absPath);
          // Remove the config hash
          this.hashes.delete(absPath);
          // Compile the config
          await this.compileConfig(absPath);
        }
        // - Changed
        else if (action === "changed") {
          // Update all dependencies that belong to this config
          await refreshEntryPathDependencies(absPath);
          // Compile the config
          await this.compileConfig(absPath);
        }
      }

      // Process server paths
      else if (pathType === "server") {
        // - Added
        if (action === "added") {
          this.entryPaths.servers.push(absPath);
          // Add all dependencies that belong to this server
          await refreshEntryPathDependencies(absPath);
          // Hash the server
          this.hashes.set(absPath, await this.hashFile(absPath));
          // Compile the server
          using h1 = (
            await this.telemetry.trace("compile-server", { serverPath: absPath })
          ).start();
          const { needBundle, name } = await this.compileAgentServer(absPath);
          if (needBundle) await this.generateServerBundle();
          h1.end();
          h0.log.info({
            message: `Agent server '${chalk.bold.italic(name)}' re-compiled in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
            attributes: { serverPath: absPath },
          });
        }
        // - Removed
        else if (action === "removed") {
          this.entryPaths.servers = this.entryPaths.servers.filter((p) => p !== absPath);
          // Remove all dependencies that belong to this server
          removeEntryPathDependencies(absPath);
          // Remove the server hash
          this.hashes.delete(absPath);
          // Remove the compilation results for that agent
          this.buildIndex.servers.delete(absPath);
          // Re-generate the server bundle
          await this.generateServerBundle();
        }
        // - Changed
        else if (action === "changed") {
          // Update all dependencies that belong to this server
          await refreshEntryPathDependencies(absPath);
          // Compile the server
          using h1 = (
            await this.telemetry.trace("recompile-server", { serverPath: absPath })
          ).start();
          const { needBundle, name } = await this.compileAgentServer(absPath);
          if (needBundle) await this.generateServerBundle();
          h1.end();
          h0.log.info({
            message: `Agent server '${chalk.bold.italic(name)}' re-compiled in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
            attributes: { serverPath: absPath },
          });
        }
      }

      // Process client paths
      else if (pathType === "client") {
        // - Added
        if (action === "added") {
          this.entryPaths.clients.push(absPath);
          // Add all dependencies that belong to this client
          await refreshEntryPathDependencies(absPath);
          // Hash the client
          this.hashes.set(absPath, await this.hashFile(absPath));
          // Compile the client
          using h1 = (
            await this.telemetry.trace("compile-client", { clientPath: absPath })
          ).start();
          const { needBundle, name } = await this.compileAgentClient(absPath);
          if (needBundle) await this.generateClientBundle();
          h1.end();
          h0.log.info({
            message: `Agent client '${chalk.bold.italic(name)}' re-compiled in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
            attributes: { clientPath: absPath },
          });
        }
        // - Removed
        else if (action === "removed") {
          this.entryPaths.clients = this.entryPaths.clients.filter((p) => p !== absPath);
          // Remove all dependencies that belong to this client
          removeEntryPathDependencies(absPath);
          // Remove the client hash
          this.hashes.delete(absPath);
          // Remove the compilation results for that agent
          this.buildIndex.clients.delete(absPath);
          // Re-generate the client bundle
          await this.generateClientBundle();
        }
        // - Changed
        else if (action === "changed") {
          // Update all dependencies that belong to this client
          await refreshEntryPathDependencies(absPath);
          // Compile the client
          using h1 = (
            await this.telemetry.trace("recompile-client", { clientPath: absPath })
          ).start();
          const { needBundle, name } = await this.compileAgentClient(absPath);
          if (needBundle) await this.generateClientBundle();
          h1.end();
          h0.log.info({
            message: `Agent client '${chalk.bold.italic(name)}' re-compiled in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
            attributes: { clientPath: absPath },
          });
        }
      }

      // Process dependency paths
      else if (pathType === "dependency") {
        // Error if the action is "added"
        if (action === "added")
          return this.telemetry.log.error({
            message: `"added" action is not supported for dependency paths. Shouldn't happen.`,
            attributes: { path: absPath },
          });

        // Find all entry paths that use this dependency and recompile them
        const recompiledAgentClients = new Set<string>();
        const recompiledAgentServers = new Set<string>();
        let needClientBundle = false;
        let needServerBundle = false;
        const touchedPaths = new Set<string>();
        for (const [entryPath, dependencies] of this.entryPaths.dependenciesMap) {
          if (dependencies.has(absPath)) touchedPaths.add(entryPath);
        }
        using h1 = (
          await this.telemetry.trace("recompile-touched-paths", { touchedPaths })
        ).start();
        await Promise.all(
          Array.from(touchedPaths).map(async (touchedPath) => {
            // Refresh all dependencies that belong to this touched path
            await refreshEntryPathDependencies(touchedPath);

            // Retrieve the touched path type
            const touchedPathType = this.isEntryPath(touchedPath);
            if (!touchedPathType) {
              this.telemetry.log.error({
                message: `Dependency path type not supported. Shouldn't happen. Received path: ${touchedPath}`,
                attributes: { path: touchedPath },
              });
              return;
            }

            if (touchedPathType === "server") {
              const { needBundle, name } = await this.compileAgentServer(touchedPath);
              if (needBundle) needServerBundle = true;
              if (name) recompiledAgentServers.add(name);
            }
            if (touchedPathType === "client") {
              const { needBundle, name } = await this.compileAgentClient(touchedPath);
              if (needBundle) needClientBundle = true;
              if (name) recompiledAgentClients.add(name);
            }
            if (touchedPathType === "config") await this.compileConfig(touchedPath);
          }),
        );
        await Promise.all([
          needClientBundle && this.generateClientBundle(),
          needServerBundle && this.generateServerBundle(),
        ]);
        h1.end();
        const formattedServerNames = Array.from(recompiledAgentServers)
          .map((name) => `'${chalk.bold.italic(name)}'`)
          .join(", ");
        const formattedClientNames = Array.from(recompiledAgentClients)
          .map((name) => `'${chalk.bold.italic(name)}'`)
          .join(", ");
        if (recompiledAgentServers.size > 0) {
          h0.log.info({
            message: `Agent${recompiledAgentServers.size > 1 ? "s" : ""} server${recompiledAgentServers.size > 1 ? "s" : ""} ${formattedServerNames} re-compiled in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
            attributes: { touchedPaths },
          });
        }
        if (recompiledAgentClients.size > 0) {
          h0.log.info({
            message: `Agent${recompiledAgentClients.size > 1 ? "s" : ""} client${recompiledAgentClients.size > 1 ? "s" : ""} ${formattedClientNames} re-compiled in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
            attributes: { touchedPaths },
          });
        }
      }
    };

    // Watch files add/remove/change
    this.watcher.on("add", (p) => processWatchEvent("added", p));
    this.watcher.on("unlink", (p) => processWatchEvent("removed", p));
    this.watcher.on("change", (p) => processWatchEvent("changed", p));
  }

  async compileConfig(configPath: string, recompileAffectedAgents = true) {
    // Telemetry
    using h0 = (await this.telemetry.trace("compileConfig()", { configPath })).start();
    try {
      // 1. Ensure the config contains a defineConfig() call
      const configContent = await readFile(configPath, "utf-8");
      const ast = await parseAsync(Lang.TypeScript, configContent);
      const root = ast.root();
      const defineConfigCall = root.find({
        rule: { kind: "call_expression", pattern: "defineConfig($ARG)" },
      });
      if (!defineConfigCall) {
        h0.log.warn({
          message: `Config file does not contain a defineConfig() call. It has been ignored. Path: ${configPath}`,
          attributes: { path: configPath },
        });
        return;
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
        h0.log.warn({
          message: `Config file has defineConfig() but doesn't export it as default. It has been ignored. Use \`export default defineConfig(...)\` instead. Path: ${configPath}`,
          attributes: { path: configPath },
        });
        return;
      }

      // 3. Add the config to the build index
      this.buildIndex.configs.add(configPath);

      // 4. Recompiling affected agents if required
      if (recompileAffectedAgents) {
        using h1 = (
          await this.telemetry.trace("recompile-affected-agents", { configPath })
        ).start();
        // Find all agents servers and clients affected by this config
        const affectedServers = this.entryPaths.servers.filter((serverPath) =>
          this.isEntryPathTouchedByConfig(serverPath, configPath),
        );
        const affectedClients = this.entryPaths.clients.filter((clientPath) =>
          this.isEntryPathTouchedByConfig(clientPath, configPath),
        );
        h0.setAttributes({ affectedServers, affectedClients });

        // Re-compile these
        const results = await Promise.all([
          ...affectedServers.map((serverPath) => this.compileAgentServer(serverPath)),
          ...affectedClients.map((clientPath) => this.compileAgentClient(clientPath)),
        ]);

        // Re-generate the compilation indexes
        await Promise.all([this.generateServerBundle(), this.generateClientBundle()]);
        h1.end();

        // Log the results
        const names = new Set(results.map((result) => result.name).filter((name) => name !== null));
        const formattedNames = Array.from(names)
          .map((name) => `'${chalk.bold.italic(name)}'`)
          .join(", ");
        h0.log.info({
          message: `Agent${names.size > 1 ? "s" : ""} ${formattedNames} re-compiled in ${chalk.bold(`${ns.toMs(h1.getSpan().duration)}ms`)}.`,
          attributes: { configPath },
        });
      }
    } catch (error) {
      h0.log.error({
        message: "Failed to compile config file. Unexpected error.",
        error,
        attributes: { configPath },
      });
    }
  }

  async compileAgentServer(serverPath: string) {
    // Telemetry
    using h0 = (await this.telemetry.trace("compileAgentServer()", { serverPath })).start();
    try {
      // 1. Ensure the server file contains a defineAgent() call
      const serverContent = await readFile(serverPath, "utf-8");
      const ast = await parseAsync(Lang.TypeScript, serverContent);
      const root = ast.root();
      const defineAgentCall = root.find({
        rule: { kind: "call_expression", pattern: "defineAgent($ARG)" },
      });
      if (!defineAgentCall) {
        h0.log.warn({
          message: `Agent server '${chalk.bold.italic(path.relative(this.options.projectDirectory, serverPath))}' doesn't contain a ${chalk.bold.italic("defineAgent(...)")} call. It has been ignored.`,
          attributes: { serverPath },
        });
        return { needBundle: false, name: null };
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
        h0.log.warn({
          message: `Agent server '${chalk.bold.italic(path.relative(this.options.projectDirectory, serverPath))}' doesn't export ${chalk.bold.italic("defineAgent(...)")} call as default. It has been ignored. Use ${chalk.bold.italic("export default defineAgent(...)")}.`,
          attributes: { serverPath },
        });
        return { needBundle: false, name: null };
      }

      // 3. Retrieve the agent name
      let name = defineAgentCall?.getMatch("ARG")?.text() ?? null;
      if (name) name = JSON.parse(name) as string;
      if (!name) {
        h0.log.warn({
          message: `Agent server '${chalk.bold.italic(path.relative(this.options.projectDirectory, serverPath))}' has ${chalk.bold.italic("defineAgent()")} but doesn't provide a name. It has been ignored. Use ${chalk.bold.italic("defineAgent(<name>)")}.`,
          attributes: { serverPath },
        });
        return { needBundle: false, name: null };
      }

      // 4. Retrieve all the configs touching this server
      const configPaths: string[] = [];
      for (const configPath of this.buildIndex.configs) {
        if (this.isEntryPathTouchedByConfig(serverPath, configPath)) configPaths.push(configPath);
      }
      configPaths.sort((a, b) => b.length - a.length);

      // 5. Obtain a unified checksum of the server file dependencies tree
      const treeFiles = new Set<string>([serverPath, ...configPaths]);
      // - Add all dependencies from the dependenciesMap
      for (const file of deepClone(treeFiles)) {
        const deps = this.entryPaths.dependenciesMap.get(file);
        if (deps) for (const dep of deps) treeFiles.add(dep);
      }
      // - Obtain the hashes for all tree files
      const treeHashes = Array.from(treeFiles).map((file) => this.hashes.get(file));
      const filteredTreeHashes = treeHashes.filter((hash) => hash !== undefined);
      if (treeHashes.length !== filteredTreeHashes.length) {
        h0.log.warn({
          message: "Some tree files have no hash. Shouldn't happen.",
          attributes: { treeFiles },
        });
      }
      // - Compute the unified hash from all tree hashes
      const checksum = createHash("md5").update(treeHashes.join(":")).digest("hex");

      // 6. Generate agent server build content
      const content = `
      ${configPaths.map((configPath, i) => `import config${i} from "${configPath}";`).join("\n")}
import agent from "${serverPath}";
export default {
  definition: agent._definition,
  globalConfigs: [${configPaths.map((_, i) => `config${i}`).join(", ")}],
  checksum: "${checksum}"
} as const;
      `.trim();

      // 7. Write the agent server build content
      const buildPath = path.join(this.options.outputDirectory, "server", "raw", `${name}.ts`);
      await writeFile(buildPath, content, "utf-8");
      this.buildIndex.servers.add(buildPath);

      // 8. Return true to re-bundle
      return { needBundle: true, name };
    } catch (error) {
      h0.log.error({
        message: "Failed to compile agent server file. Unexpected error.",
        error,
        attributes: { serverPath },
      });
      return { needBundle: false, name: null };
    }
  }

  async compileAgentClient(clientPath: string) {
    // Telemetry
    using h0 = (await this.telemetry.trace("compileAgentClient()", { clientPath })).start();
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
        h0.log.warn({
          message: `Agent client '${chalk.bold.italic(path.relative(this.options.projectDirectory, clientPath))}' doesn't contain a ${chalk.bold.italic("defineAgentClient(...)")} call. It has been ignored.`,
          attributes: { clientPath },
        });
        return { needBundle: false, name: null };
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
        h0.log.warn({
          message: `Agent client '${chalk.bold.italic(path.relative(this.options.projectDirectory, clientPath))}' doesn't export ${chalk.bold.italic("defineAgentClient(...)")} call as default. It has been ignored. Use ${chalk.bold.italic("export default defineAgentClient(...)")}.`,
          attributes: { clientPath },
        });
        return { needBundle: false, name: null };
      }

      // 3. Retrieve the agent name
      let name = defineAgentClientCall?.getMatch("ARG")?.text() ?? null;
      if (name) name = JSON.parse(name) as string;
      if (!name) {
        h0.log.warn({
          message: `Agent client '${chalk.bold.italic(path.relative(this.options.projectDirectory, clientPath))}' has ${chalk.bold.italic("defineAgentClient()")} but doesn't provide a name. It has been ignored. Use ${chalk.bold.italic("defineAgentClient(<name>)")}.`,
          attributes: { clientPath },
        });
        return { needBundle: false, name: null };
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

      const content =
        `import agentClient from "${clientPath.replace(path.extname(clientPath), "")}";
export default {
  definition: agentClient._definition,
  plugins: {
${pluginEntries}
  }
} as const;
      `.trim();

      // 6. Write the agent client build content
      const buildPath = path.join(this.options.outputDirectory, "client", `${name}.ts`);
      await writeFile(buildPath, content, "utf-8");
      this.buildIndex.clients.add(buildPath);

      // 7. Return true to re-bundle
      return { needBundle: true, name };
    } catch (error) {
      h0.log.error({
        message: "Failed to compile agent client file. Unexpected error.",
        error,
        attributes: { clientPath },
      });
      return { needBundle: false, name: null };
    }
  }

  async generateServerBundle() {
    // Telemetry
    using h0 = (await this.telemetry.trace("generateServerBundle()")).start();
    try {
      // 1. Generate a map of server names to their paths
      const serversMap: Record<string, string> = {};
      for (const serverPath of this.buildIndex.servers) {
        const name = path.basename(serverPath, ".ts");
        serversMap[name] = serverPath;
      }

      // 2. Produce the raw bundle index file
      const indexContent = `${Object.entries(serversMap)
        .map(([name, p]) => `import ${name} from "${p}";`)
        .join("\n")}
export default {
  ${Object.keys(serversMap)
    .map((name) => `"${name}": ${name}`)
    .join(",\n")}
}
`.trim();
      const indexPath = path.join(this.options.outputDirectory, "server", "raw", "index.ts");
      await writeFile(indexPath, indexContent, "utf-8");

      // 3. If an optimize build is not requested, use the raw index as bundle index
      const distIndexPath = path.join(this.options.outputDirectory, "server", "dist", "index.ts");
      if (!this.options.optimize) {
        await writeFile(distIndexPath, indexContent, "utf-8");
        return;
      }

      // 4. Else, use ESBuild to bundle the raw index
      if (this.serverBundleContext) await this.serverBundleContext.cancel();
      else {
        this.serverBundleContext = await esbuild.context({
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
      await this.serverBundleContext.rebuild();
    } catch (error) {
      h0.log.error({ message: "Failed to generate server bundle. Unexpected error.", error });
    }
  }

  async generateClientBundle() {
    // Telemetry
    using h0 = (await this.telemetry.trace("generateClientBundle()")).start();
    try {
      // 1. Generate a map of client names to their paths
      const clientsMap: Record<string, string> = {};
      for (const clientPath of this.buildIndex.clients) {
        const name = path.basename(clientPath, ".ts");
        clientsMap[name] = clientPath;
      }

      // 2. Produce the raw bundle index file
      const indexContent = `${Object.entries(clientsMap)
        .map(([name, p]) => `import ${name} from "${p.replace(path.extname(p), "")}";`)
        .join("\n")}
export default {
  ${Object.keys(clientsMap)
    .map((name) => `"${name}": ${name}`)
    .join(",\n")}
}
`.trim();
      const indexPath = path.join(this.options.outputDirectory, "client", "index.ts");
      await writeFile(indexPath, indexContent, "utf-8");
    } catch (error) {
      h0.log.error({ message: "Failed to generate client bundle. Unexpected error.", error });
    }
  }

  ensureAbsolute(p: string) {
    return path.resolve(this.options.projectDirectory, p);
  }

  async resetOutputDirectory() {
    await rm(this.options.outputDirectory, { recursive: true, force: true });
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

  async hashFile(filePath: string) {
    const content = await readFile(filePath, "utf-8");
    return createHash("md5").update(content).digest("hex");
  }

  async getPathDependencies(entryPath: string) {
    const absPath = this.ensureAbsolute(entryPath);
    using h0 = (
      await this.telemetry.trace("getPathDependencies()", { entryPath, absPath })
    ).start();
    try {
      const result = await esbuild.build({
        entryPoints: [entryPath],
        outdir: this.options.outputDirectory,
        bundle: true,
        format: "esm",
        packages: "external",
        jsx: "automatic",
        write: false,
        logLevel: "silent",
        metafile: true,
        loader: {
          ".node": "file",
        },
      });
      return Object.keys(result.metafile?.inputs ?? {})
        .map((p) => this.ensureAbsolute(p))
        .filter((p) => p !== absPath);
    } catch (error) {
      h0.log.error({
        message: "Obtaining agent file inputs failed.",
        error,
        attributes: { isEsbuild: true },
      });
    }
    return [];
  }

  async findNodeModules(startPath: string) {
    let currentDir = startPath;

    while (currentDir !== "/") {
      const nodeModulesPath = join(currentDir, "node_modules");
      // biome-ignore lint/performance/noAwaitInLoops: no other choice here
      if (await this.fileExists(nodeModulesPath)) {
        this.telemetry.log.debug({ message: `Node_modules path: ${nodeModulesPath}` });
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

  isEntryPathTouchedByConfig(entryPath: string, configPath: string): boolean {
    const configDir = path.dirname(configPath);
    const relativePath = path.relative(configDir, entryPath);
    return !relativePath.startsWith("..");
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
    if (this.languageService) return;

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

    this.serviceHost = {
      getScriptFileNames: () => Array.from(this.virtualFiles.keys()),
      getScriptVersion: (fileName: string) => {
        // Return version number that increments on each change
        return String(this.fileVersions.get(fileName) || 1);
      },
      getScriptSnapshot: (fileName: string) => {
        // Check virtual files first
        const virtualContent = this.virtualFiles.get(fileName);
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

    this.languageService = ts.createLanguageService(this.serviceHost, ts.createDocumentRegistry());
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
      if (!this.languageService) {
        this.initLanguageService();
        if (!this.languageService) return [];
      }

      // Extract plugins array from source
      const content = await readFile(clientPath, "utf-8");
      const pluginsArray = await this.extractPluginsArray(content);
      if (!pluginsArray) return [];

      // Check cache
      const hash = createHash("md5").update(pluginsArray).digest("hex");
      const cached = this.pluginNamesCache.get(clientPath);
      if (cached?.hash === hash) return cached.names;

      // Build minimal TypeScript content
      const imports = await this.extractImports(content);
      const virtualContent = `${imports}

const plugins = ${pluginsArray} as const;
type __ExtractedPlugins = typeof plugins[number]["_definition"]["name"];`;

      // Update virtual file
      this.virtualFiles.set(clientPath, virtualContent);
      const version = (this.fileVersions.get(clientPath) || 0) + 1;
      this.fileVersions.set(clientPath, version);

      // Get type information
      const program = this.languageService.getProgram();
      if (!program) return [];

      const sourceFile = program.getSourceFile(clientPath);
      if (!sourceFile) return [];

      const typeAlias = this.findTypeAlias(sourceFile);
      if (!typeAlias) return [];

      const type = program.getTypeChecker().getTypeAtLocation(typeAlias.type || typeAlias);
      const pluginNames = this.extractUnionMembers(type);

      // Cache result
      this.pluginNamesCache.set(clientPath, { hash, names: pluginNames });
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
