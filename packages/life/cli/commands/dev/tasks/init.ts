import { type ChildProcess, execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import chalk from "chalk";
import { getVersion, type VersionInfo } from "@/cli/utils/version";
import { LifeCompiler } from "@/compiler";
import { LifeServer } from "@/server";
import * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/node";
import type { TelemetryLogLevel } from "@/telemetry/types";
import type { DevOptions } from "../action";
import { checkLivekitInstall } from "../lib/check-livekit-install";
import { cleanStdData } from "../lib/clean-std-data";

const LIVEKIT_DATATIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{4}\s*/;

interface InitTaskListeners {
  onStatus?: (status: string) => void;
  onProgress?: (progress: number) => void;
  onError?: (error: string) => void;
  onVersion?: (version: VersionInfo) => void;
  onServer?: (server: LifeServer) => void;
  onCompiler?: (compiler: LifeCompiler) => void;
  onLivekitProcess?: (livekitProcess: ChildProcess) => void;
}

export class InitTask {
  readonly telemetry: TelemetryClient;
  readonly options: DevOptions;
  listeners: InitTaskListeners;
  intervals: NodeJS.Timeout[] = [];
  _status = "Initializing...";
  _progress = 0;
  _error: string | null = null;
  _version: VersionInfo | null = null;
  _server: LifeServer | null = null;
  _compiler: LifeCompiler | null = null;
  _livekitProcess: ChildProcess | null = null;

  constructor({
    telemetry,
    options,
    listeners,
  }: {
    telemetry: TelemetryClient;
    options: DevOptions;
    listeners?: InitTaskListeners;
  }) {
    this.telemetry = telemetry;
    this.options = options;
    this.listeners = listeners ?? {};
  }

  setStatus(status: string) {
    this._status = status;
    this.listeners.onStatus?.(status);
  }

  setProgress(progress: number) {
    this._progress = progress;
    this.listeners.onProgress?.(progress);
  }

  setError(error: string) {
    this._error = error;
    this.listeners.onError?.(error);
  }

  setVersion(version: VersionInfo) {
    this._version = version;
    this.listeners.onVersion?.(version);
  }

  setServer(server: LifeServer) {
    this._server = server;
    this.listeners.onServer?.(server);
  }

  setCompiler(compiler: LifeCompiler) {
    this._compiler = compiler;
    this.listeners.onCompiler?.(compiler);
  }

  setLivekitProcess(livekitProcess: ChildProcess) {
    this._livekitProcess = livekitProcess;
    this.listeners.onLivekitProcess?.(livekitProcess);
  }

  // Helper function to execute initialization commands and capture output
  command(command: string) {
    try {
      this.telemetry.log.debug({ message: `Running init command \`${command}\`.` });
      const output = execSync(command, { stdio: ["pipe", "pipe", "pipe"] });
      for (const line of cleanStdData(output ?? []).map((l) => `[${command}] ${l}`)) {
        this.telemetry.log.info({ message: line });
      }
      return op.success();
    } catch (error) {
      // Node's execSync error includes stderr property when command fails
      if (error instanceof Error) {
        const execError = error as Error & { stderr?: Buffer };
        error.message = execError.stderr?.toString("utf-8") || error.message || "Command failed";
      }
      return op.failure({
        code: "Unknown",
        message: `Uncaught error during this.command('${command}').`,
        cause: error,
      });
    }
  }

  // Helper function to check if a port is available
  checkPort(port: number): Promise<boolean> {
    return new Promise((resolve) => {
      const testServer = createServer();
      testServer.once("error", (err: NodeJS.ErrnoException) => {
        resolve(err.code !== "EADDRINUSE");
      });
      testServer.once("listening", () => {
        testServer.close();
        resolve(true);
      });
      testServer.listen(port, "127.0.0.1");
    });
  }

  waitForPort(port: number, maxWaitMs: number): Promise<boolean> {
    const startTime = Date.now();

    const tryPort = async (): Promise<boolean> => {
      if (Date.now() - startTime >= maxWaitMs) return false;

      const isAvailable = await this.checkPort(port);
      if (isAvailable) return true;

      await new Promise((res) => setTimeout(res, 500));
      return tryPort();
    };

    return tryPort();
  }

  // Helper function to run a step of the initialization
  async step<T extends MaybePromise<op.OperationResult<unknown>>>({
    name,
    progressAfter,
    run,
    timeout = 5000,
  }: {
    name: string;
    progressAfter: number;
    run: () => MaybePromise<T>;
    timeout?: number;
  }): Promise<T> {
    try {
      this.telemetry.log.debug({ message: `Running init step '${name}'.` });

      // Reflect current step status in the UI
      this.setStatus(name);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Schedule a timeout promise
      const timeoutPromise = new Promise<T>((resolve) => {
        setTimeout(() => {
          resolve(
            op.failure({
              code: "Timeout",
              message: `Init step '${name}' timed out after ${timeout}ms.`,
            }) as T,
          );
        }, timeout);
      });

      // Wait for the step or the timeout to resolve, and return the result
      const result = await Promise.race([run(), timeoutPromise]);
      if (!result[0]) {
        this.setProgress(progressAfter);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return result;
    } catch (error) {
      return op.failure({
        code: "Unknown",
        message: `Failed to run init step '${name}'.`,
        cause: error,
      }) as T;
    }
  }

  async run() {
    // Ensure server token is set
    const [errServerToken, serverToken] = await this.step({
      name: "Checking server token...",
      progressAfter: 10,
      run: () => {
        const _serverToken = this.options.token ?? process.env.LIFE_SERVER_TOKEN ?? null;
        if (!_serverToken)
          return op.failure({
            code: "NotFound",
            message: `Server token is required.\nUse the --token flag or set LIFE_SERVER_TOKEN environment variable.\n\nHere is one generated for you :)\n\n${chalk.bold(`LIFE_SERVER_TOKEN=${randomBytes(32).toString("base64url")}`)}\n\nJust put it in your .env file.`,
          });
        return op.success(_serverToken);
      },
    });
    if (errServerToken) return op.failure(errServerToken);

    // Obtain Livekit server installation status
    let [errLkInstall, lkInstall] = await this.step({
      name: "Checking LiveKit server installation...",
      progressAfter: 20,
      run: async () => op.success(await checkLivekitInstall()),
    });
    if (errLkInstall) return op.failure(errLkInstall);

    // Install Livekit server if missing
    const [errInstallLk] = await this.step({
      name: "Installing LiveKit server...",
      progressAfter: 30,
      timeout: 60_000,
      run: async () => {
        if (lkInstall.installed) return op.success();

        // - MacOS
        if (process.platform === "darwin") {
          this.telemetry.log.info({ message: "Running: brew update && brew install livekit" });
          const [err] = this.command("brew update && brew install livekit");
          if (err) {
            return op.failure({
              code: "Unknown",
              message:
                "Failed to install LiveKit server via Homebrew.\nPlease install it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
            });
          }
        }
        // - Linux
        else if (process.platform === "linux") {
          this.telemetry.log.info({ message: "Running: curl -sSL https://get.livekit.io | bash" });
          const [err] = this.command("curl -sSL https://get.livekit.io | bash");
          if (err) {
            return op.failure({
              code: "Unknown",
              message:
                "Failed to install LiveKit server.\nPlease install it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
            });
          }
        }
        // - Windows
        else if (process.platform === "win32") {
          return op.failure({
            code: "Unknown",
            message:
              "Server requires the 'livekit-server' command to be installed.\nAutomatic installation is not supported on Windows yet.\nPlease install it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
          });
        }
        // - Unsupported
        else {
          return op.failure({
            code: "Unknown",
            message:
              "Server requires the 'livekit-server' command to be installed.\nAutomatic installation is not supported on this platform yet.\nPlease install it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
          });
        }

        // Check the install again
        lkInstall = await checkLivekitInstall();
        if (!lkInstall.installed) {
          return op.failure({
            code: "Unknown",
            message:
              "Server requires the 'livekit-server' command to be installed.\nAutomatic installation failed.\nPlease install it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
          });
        }
        return op.success();
      },
    });
    if (errInstallLk) return op.failure(errInstallLk);

    // Upgrade LiveKit server if needed
    const minLivekitVersionPrefix = "1.9";
    const [errUpgradeLk] = await this.step({
      name: "Upgrading LiveKit server...",
      progressAfter: 40,
      timeout: 60_000,
      run: async () => {
        if (!lkInstall.version?.startsWith(minLivekitVersionPrefix)) {
          // - MacOS
          if (process.platform === "darwin") {
            this.telemetry.log.info({ message: "Running: brew update && brew upgrade livekit" });
            const [err] = this.command("brew update && brew upgrade livekit");
            if (err) {
              return op.failure({
                code: "Unknown",
                message:
                  "Failed to upgrade LiveKit server via Homebrew.\nPlease upgrade it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
              });
            }
          }
          // - Linux
          else if (process.platform === "linux") {
            this.telemetry.log.info({
              message: "Running: curl -sSL https://get.livekit.io | bash",
            });
            const [err] = this.command("curl -sSL https://get.livekit.io | bash");
            if (err) {
              return op.failure({
                code: "Unknown",
                message:
                  "Failed to upgrade LiveKit server.\nPlease upgrade it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
              });
            }
          }
          // - Windows
          else if (process.platform === "win32") {
            return op.failure({
              code: "Unknown",
              message: `Server requires the 'livekit-server' command version >= ${minLivekitVersionPrefix}.* (current version: ${lkInstall.version}).\nAutomatic upgrade is not supported on Windows yet.\nPlease upgrade it manually by visiting https://docs.livekit.io/home/self-hosting/local/`,
            });
          }
          // - Unsupported
          else {
            return op.failure({
              code: "Unknown",
              message: `Server requires the 'livekit-server' command version >= ${minLivekitVersionPrefix}.* (current version: ${lkInstall.version}).\nAutomatic upgrade is not supported on this platform yet.\nPlease upgrade it manually by visiting https://docs.livekit.io/home/self-hosting/local/`,
            });
          }

          // Check the install again
          lkInstall = await checkLivekitInstall();
          if (!(lkInstall.installed && lkInstall.version?.startsWith(minLivekitVersionPrefix))) {
            return op.failure({
              code: "Unknown",
              message: `Server requires the 'livekit-server' command version >= ${minLivekitVersionPrefix}.* (current version: ${lkInstall.version}).\nAutomatic upgrade failed.\nPlease upgrade it manually by visiting https://docs.livekit.io/home/self-hosting/local/`,
            });
          }
        }
        return op.success();
      },
    });
    if (errUpgradeLk) return op.failure(errUpgradeLk);

    // Start LiveKit server
    const [errStartLk] = await this.step({
      name: "Starting LiveKit server...",
      progressAfter: 50,
      timeout: 15_000,
      run: async () => {
        // Wait for port 7880 to be available
        const livekitPort = 7880;
        const isPortAvailable = await this.waitForPort(livekitPort, 10_000);

        // Initialize webrtc telemetry client
        const webrtcTelemetry = createTelemetryClient("webrtc", {});

        if (!isPortAvailable) {
          return op.failure({
            code: "Unknown",
            message: `Port ${livekitPort} is still in use after waiting. Please free the port and try again.`,
          });
        }

        // Spawn the LiveKit server process
        const livekitServer = spawn("livekit-server", ["--dev"], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        this.setLivekitProcess(livekitServer);

        // Clean LiveKit logs and push them to the logs states
        const cleanLivekitLogs = (
          lines: string[],
        ): { level: TelemetryLogLevel; message: string }[] => {
          return (
            lines
              // Remove DEBUG logs
              .filter((line) => !line.trim().includes("DEBUG livekit"))
              // Format the log
              .map((line) => {
                let logLevel: TelemetryLogLevel;
                if (line.includes(" DEBUG ")) logLevel = "debug";
                else if (line.includes(" WARN ")) logLevel = "warn";
                else if (line.includes(" ERROR ")) logLevel = "error";
                else if (line.includes(" FATAL ")) logLevel = "fatal";
                else logLevel = "info";
                return {
                  level: logLevel,
                  message: line
                    .replaceAll(" WARN livekit", "")
                    .replaceAll(" ERROR livekit", "")
                    .replaceAll(" DEBUG livekit", "")
                    .replaceAll(" INFO livekit", "")
                    .replaceAll(" FATAL livekit", "")
                    // Remove datetime like "2025-09-16T07:29:29.693-0700"
                    .replace(LIVEKIT_DATATIME_RE, "")
                    .trim(),
                };
              })
          );
        };

        for (const channel of ["stdout", "stderr"] as const) {
          livekitServer[channel]?.on("data", (data) => {
            const formattedLogs = cleanLivekitLogs(cleanStdData(data));
            for (const line of formattedLogs) {
              webrtcTelemetry.log[line.level as TelemetryLogLevel]({ message: line.message });
            }
          });
        }

        return op.success();
      },
    });
    if (errStartLk) return op.failure(errStartLk);

    // Obtain Life.js version
    const [errGetVersion] = await this.step({
      name: "Checking Life.js version...",
      progressAfter: 60,
      run: async () => {
        this.setVersion(await getVersion());
        return op.success();
      },
    });
    if (errGetVersion) return op.failure(errGetVersion);

    // Initialize compiler
    const [errInitializeCompiler] = await this.step({
      name: "Initializing compiler...",
      progressAfter: 70,
      run: () => {
        const newCompiler = new LifeCompiler({
          projectDirectory: this.options.root,
          outputDirectory: ".life",
          watch: true,
        });
        this.setCompiler(newCompiler);
        return op.success();
      },
    });
    if (errInitializeCompiler) return op.failure(errInitializeCompiler);

    // Start compiler
    const [errStartCompiler] = await this.step({
      name: "Starting Life.js compiler...",
      progressAfter: 75,
      timeout: 60_000,
      run: async () => {
        if (!this._compiler)
          return op.failure({
            code: "NotFound",
            message: "Compiler is not initialized.",
          });
        const [errCompiler] = await this._compiler.start();
        if (errCompiler) return op.failure(errCompiler);
        return op.success();
      },
    });
    if (errStartCompiler) return op.failure(errStartCompiler);

    // Initialize server
    const [errInitializeServer] = await this.step({
      name: "Initializing server...",
      progressAfter: 80,
      run: () => {
        // Create server instance
        const newServer = new LifeServer({
          projectDirectory: this.options.root,
          token: serverToken,
          watch: true,
          host: this.options.host,
          port: this.options.port,
        });
        this.setServer(newServer);
        return op.success();
      },
    });
    if (errInitializeServer) return op.failure(errInitializeServer);

    // Start Life.js server
    const [errStartServer] = await this.step({
      name: "Starting Life.js server...",
      progressAfter: 90,
      run: async () => {
        if (!this._server)
          return op.failure({
            code: "NotFound",
            message: "Server is not initialized.",
          });
        const [errServer] = await this._server.start();
        if (errServer) return op.failure(errServer);
        return op.success();
      },
    });
    if (errStartServer) return op.failure(errStartServer);

    // Done
    const [errDone] = await this.step({
      name: "Done!",
      progressAfter: 100,
      run: () => {
        setTimeout(() => this.setProgress(100), 50);
        return op.success();
      },
    });
    if (errDone) return op.failure(errDone);

    // Return success
    return op.success();
  }
}
