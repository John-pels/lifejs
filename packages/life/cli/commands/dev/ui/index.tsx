import { type ChildProcess, execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { ThemeProvider } from "@inkjs/ui";
import chalk from "chalk";
import { Box, Text, useInput } from "ink";
import Link from "ink-link";
import { useEffect, useRef, useState } from "react";
import { getVersion, type VersionInfo } from "@/cli/utils/version";
import { LifeCompiler } from "@/compiler";
import { LifeServer } from "@/server";
import type { AgentProcessClient } from "@/server/agent-process/client";
import { canon, type SerializableValue } from "@/shared/canon";
import * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { formatLogForTerminal } from "@/telemetry/helpers/formatting/terminal";
import { logLevelPriority } from "@/telemetry/helpers/log-level-priority";
import { theme, themeChalk } from "../../../utils/theme";
import type { DevOptions } from "../action";
import { ConditionalMouseProvider } from "../components/conditional-mouse-provider";
import { Divider } from "../components/divider";
import { FullScreenBox } from "../components/fullscreen-box.js";
import { checkLivekitInstall } from "../lib/check-livekit-install";
import { cleanStdData } from "../lib/clean-std-data";
import { customInkUITheme } from "../lib/inkui-theme";
import { DEFAULT_TABS } from "../lib/tabs";
import { DevContent } from "./content";
import { DevFooter } from "./footer";
import { DevLoader } from "./loader";
import { DevSidebar } from "./sidebar";

export const DevUI = ({
  options,
  telemetry,
}: {
  options: DevOptions;
  telemetry: TelemetryClient;
}) => {
  // Track the progress and status of the init() task
  // If an init error is set, the app will clean up, show all logs with an error title, and exit
  const [initProgress, setInitProgress] = useState(0);
  const [initStatus, setInitStatus] = useState<string | null>("Initializing...");
  const [initError, setInitError] = useState<string | null>(null);

  // Track the progress and status of the exit() task
  const [exitProgress, setExitProgress] = useState(0);
  const [exitStatus, setExitStatus] = useState<string | null>("Exiting...");

  // When debug mode is enabled, UI controls are hidden and debug logs are shown
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);

  // Processes
  const server = useRef<LifeServer | null>(null);
  const compiler = useRef<LifeCompiler | null>(null);
  const livekitProcess = useRef<ChildProcess | null>(null);
  const [agentProcesses, setAgentProcesses] = useState<Map<string, AgentProcessClient>>(new Map());

  // Life.js version info (used in the sidebar banner)
  const [version, setVersion] = useState<VersionInfo | null>(null);

  // Manage tabs and selected tab
  const [tabs, setTabs] = useState<string[]>(
    options.debug ? DEFAULT_TABS : DEFAULT_TABS.filter((tab) => tab !== "cli"),
  );
  const [selectedTab, setSelectedTab] = useState("server");

  // Logs
  const [logs, setLogs] = useState<Record<string, string[]>>({
    server: [],
    compiler: [],
    webrtc: [],
    cli: [],
  });
  const [debugLogs, setDebugLogs] = useState<Record<string, string[]>>({
    server: [],
    compiler: [],
    webrtc: [],
    cli: [],
  });
  const [allLogs, setAllLogs] = useState<string[]>([]);

  // Intervals
  const intervals = useRef<NodeJS.Timeout[]>([]);

  // Cleanup function, used on process exit
  async function exit() {
    setExitStatus("Stopping server...");
    await server.current?.stop();
    setExitProgress(30);

    setExitStatus("Stopping compiler...");
    await compiler.current?.stop();
    setExitProgress(60);

    setExitStatus("Stopping LiveKit server...");
    livekitProcess.current?.kill();
    setExitProgress(90);
    setExitStatus("Exiting...");

    // Done
    setExitStatus("Done!");
    setTimeout(() => {
      setExitProgress(100);
    }, 50);
  }

  // Exit the app when the exit progress is 100
  useEffect(() => {
    if (exitProgress === 100) process.exit(initError ? 1 : 0);
  }, [exitProgress]);

  // Helper function to execute initialization commands and capture output
  const initCommand = (command: string) => {
    try {
      telemetry.log.debug({ message: `Running initCommand('${command}').` });
      const output = execSync(command, { stdio: ["pipe", "pipe", "pipe"] });
      if (output)
        setAllLogs((prev) => [
          ...prev,
          ...cleanStdData(output).map((line) => `[${command}] ${line}`),
        ]);
      return op.success();
    } catch (error) {
      // Node's execSync error includes stderr property when command fails
      if (error instanceof Error) {
        const execError = error as Error & { stderr?: Buffer };
        error.message = execError.stderr?.toString("utf-8") || error.message || "Command failed";
      }
      return op.failure({
        code: "Unknown",
        message: `Uncaught error during initCommand('${command}').`,
        cause: error,
      });
    }
  };

  // Helper function to run a step of the initialization
  const initStep = async <T extends MaybePromise<op.OperationResult<unknown>>>({
    name,
    progressAfter,
    run,
    timeout = 5000,
  }: {
    name: string;
    progressAfter: number;
    run: () => MaybePromise<T>;
    timeout?: number;
  }): Promise<T> => {
    try {
      telemetry.log.debug({ message: `Starting initStep('${name}').` });

      // Reflect current step status in the UI
      setInitStatus(name);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Schedule a timeout promise
      const timeoutPromise = new Promise<T>((resolve) => {
        setTimeout(() => {
          resolve(
            op.failure({
              code: "Timeout",
              message: `Step '${name}' timed out after ${timeout}ms.`,
            }) as T,
          );
        }, timeout);
      });

      // Wait for the step or the timeout to resolve, and return the result
      const result = await Promise.race([run(), timeoutPromise]);
      if (!result[0]) {
        setInitProgress(progressAfter);
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return result;
    } catch (error) {
      return op.failure({
        code: "Unknown",
        message: `Uncaught error during initStep('${name}').`,
        cause: error,
      }) as T;
    }
  };

  // Initilization task
  async function init() {
    // Pipe all the CLI logs to allLogs
    const [errSetupLogging] = await initStep({
      name: "Setup logging...",
      progressAfter: 5,
      run: () => {
        telemetry.registerConsumer({
          async start(queue) {
            for await (const item of queue) {
              if (item.type !== "log") continue;
              const formattedLog = formatLogForTerminal(item);
              setAllLogs((prev) => [...prev, formattedLog]);

              // Push any log to debug logs for CLI tab
              setDebugLogs((prev) => ({
                ...prev,
                cli: [...(prev.cli ?? []), formattedLog],
              }));

              // Ignore logs lower than the requested log level
              if (
                logLevelPriority(item.level) >= logLevelPriority(options.debug ? "debug" : "info")
              ) {
                setLogs((prev) => ({
                  ...prev,
                  cli: [...(prev.cli ?? []), formattedLog],
                }));
              }
            }
          },
        });
        // Intercept console methods to capture logs without interfering with stdin
        const consoleMethods = ["log", "error", "warn", "info", "debug"] as const;
        for (const method of consoleMethods) {
          const original = console[method];
          console[method] = (...args: unknown[]) => {
            const logLine = args.map((arg) => String(arg)).join(" ");
            setAllLogs((prev) => [...prev, `[console.${method}] ${logLine}`]);
            original(...args);
          };
        }
        return op.success();
      },
    });
    if (errSetupLogging) return op.failure(errSetupLogging);

    // Ensure server token is set
    const [errServerToken, serverToken] = await initStep({
      name: "Checking server token...",
      progressAfter: 10,
      run: () => {
        const _serverToken = options.token ?? process.env.LIFE_SERVER_TOKEN ?? null;
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
    let [errLkInstall, lkInstall] = await initStep({
      name: "Checking LiveKit server installation...",
      progressAfter: 20,
      run: async () => {
        return op.success(await checkLivekitInstall());
      },
    });
    if (errLkInstall) return op.failure(errLkInstall);

    // Install Livekit server if missing
    const [errInstallLk] = await initStep({
      name: "Installing LiveKit server...",
      progressAfter: 25,
      timeout: 60_000,
      run: async () => {
        if (lkInstall.installed) return op.success();

        // - MacOS
        if (process.platform === "darwin") {
          telemetry.log.info({ message: "Running: brew update && brew install livekit" });
          const [err] = initCommand("brew update && brew install livekit");
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
          telemetry.log.info({ message: "Running: curl -sSL https://get.livekit.io | bash" });
          const [err] = initCommand("curl -sSL https://get.livekit.io | bash");
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
    const [errUpgradeLk] = await initStep({
      name: "Upgrading LiveKit server...",
      progressAfter: 30,
      timeout: 60_000,
      run: async () => {
        if (!lkInstall.version?.startsWith(minLivekitVersionPrefix)) {
          // - MacOS
          if (process.platform === "darwin") {
            telemetry.log.info({ message: "Running: brew update && brew upgrade livekit" });
            const [err] = initCommand("brew update && brew upgrade livekit");
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
            telemetry.log.info({ message: "Running: curl -sSL https://get.livekit.io | bash" });
            const [err] = initCommand("curl -sSL https://get.livekit.io | bash");
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
    const [errStartLk] = await initStep({
      name: "Starting LiveKit server...",
      progressAfter: 40,
      run: () => {
        const livekitServer = spawn("livekit-server", ["--dev"], {
          stdio: ["ignore", "pipe", "pipe"],
        });
        livekitProcess.current = livekitServer;

        const cleanLivekitLogs = (lines: string[]): string[] => {
          return lines
            .map(
              (line) =>
                `${themeChalk.level.info.bold("⦿")} ${themeChalk.gray.medium(`[${themeChalk.gray.medium("LiveKit")}] `)}` +
                // Remove datetime like "2025-09-16T07:29:29.693-0700"
                line
                  .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{4}\s*/, "")
                  .trim(),
            )
            .filter(Boolean);
        };

        livekitServer.stdout?.on("data", (data) => {
          const formattedLogs = cleanLivekitLogs(cleanStdData(data));
          setDebugLogs((prev) => ({
            ...prev,
            webrtc: [...(prev.webrtc ?? []), ...formattedLogs],
          }));
          setLogs((prev) => ({
            ...prev,
            webrtc: [...(prev.webrtc ?? []), ...formattedLogs],
          }));
          setAllLogs((prev) => [...prev, ...formattedLogs]);
        });
        livekitServer.stderr?.on("data", (data) => {
          const formattedLogs = cleanLivekitLogs(cleanStdData(data));
          setDebugLogs((prev) => ({
            ...prev,
            webrtc: [...(prev.webrtc ?? []), ...formattedLogs],
          }));
          setLogs((prev) => ({
            ...prev,
            webrtc: [...(prev.webrtc ?? []), ...formattedLogs],
          }));
          setAllLogs((prev) => [...prev, ...formattedLogs]);
        });
        return op.success();
      },
    });
    if (errStartLk) return op.failure(errStartLk);

    // Download AI models
    const [errDownloadAiModels] = await initStep({
      name: "Downloading AI models...",
      progressAfter: 50,
      timeout: 60_000,
      run: () => {
        return op.success(); // TODO
      },
    });
    if (errDownloadAiModels) return op.failure(errDownloadAiModels);

    // Obtain Life.js version
    const [errGetVersion] = await initStep({
      name: "Checking Life.js version...",
      progressAfter: 60,
      run: async () => {
        setVersion(await getVersion());
        return op.success();
      },
    });
    if (errGetVersion) return op.failure(errGetVersion);

    // Initialize compiler
    const [errInitializeCompiler] = await initStep({
      name: "Initializing compiler...",
      progressAfter: 70,
      run: () => {
        const newCompiler = new LifeCompiler({
          projectDirectory: options.root,
          outputDirectory: ".life",
          watch: true,
        });
        compiler.current = newCompiler;

        // Consume compiler telemetry logs
        newCompiler.telemetry.registerConsumer({
          async start(queue) {
            for await (const signal of queue) {
              if (signal.type !== "log") continue;

              // Format the log
              const formattedLog = formatLogForTerminal(signal);

              // Push any log to debug logs
              setDebugLogs((prev) => ({
                ...prev,
                compiler: [...(prev.compiler ?? []), formattedLog],
              }));
              setAllLogs((prev) => [...prev, formattedLog]);

              // Ignore logs lower than the requested log level
              if (
                logLevelPriority(signal.level) >= logLevelPriority(options.debug ? "debug" : "info")
              ) {
                // Format and record the logs
                setLogs((prev) => ({
                  ...prev,
                  compiler: [...(prev.compiler ?? []), formattedLog],
                }));
              }
            }
          },
        });
        return op.success();
      },
    });
    if (errInitializeCompiler) return op.failure(errInitializeCompiler);

    // Start compiler
    const [errStartCompiler] = await initStep({
      name: "Starting Life.js compiler...",
      progressAfter: 75,
      run: async () => {
        if (!compiler.current)
          return op.failure({
            code: "NotFound",
            message: "Compiler is not initialized.",
          });
        const [errCompiler] = await compiler.current.start();
        if (errCompiler) return op.failure(errCompiler);
        return op.success();
      },
    });
    if (errStartCompiler) return op.failure(errStartCompiler);

    // Initialize server
    const [errInitializeServer] = await initStep({
      name: "Initializing server...",
      progressAfter: 80,
      run: () => {
        // Create server instance
        const newServer = new LifeServer({
          projectDirectory: options.root,
          token: serverToken,
          watch: true,
          host: options.host,
          port: options.port,
        });
        server.current = newServer;

        // Consume server telemetry logs
        newServer.telemetry.registerConsumer({
          async start(queue) {
            for await (const signal of queue) {
              if (signal.type !== "log") continue;

              // Format the log
              const formattedLog = formatLogForTerminal(signal);

              // Tab

              // Push any log to debug logs
              setDebugLogs((prev) => ({
                ...prev,
                server: [...(prev.server ?? []), formattedLog],
              }));
              setAllLogs((prev) => [...prev, formattedLog]);

              // Ignore logs lower than the requested log level
              if (
                logLevelPriority(signal.level) >= logLevelPriority(options.debug ? "debug" : "info")
              ) {
                // Format and record the logs
                setLogs((prev) => ({
                  ...prev,
                  server: [...(prev.server ?? []), formattedLog],
                }));
              }
            }
          },
        });
        return op.success();
      },
    });
    if (errInitializeServer) return op.failure(errInitializeServer);

    // Start Life.js server
    const [errStartServer] = await initStep({
      name: "Starting Life.js server...",
      progressAfter: 90,
      run: async () => {
        if (!server.current)
          return op.failure({
            code: "NotFound",
            message: "Server is not initialized.",
          });
        const [errServer] = await server.current.start();
        if (errServer) return op.failure(errServer);
        return op.success();
      },
    });
    if (errStartServer) return op.failure(errStartServer);

    // Listen for agent processes changes
    const [errPrepareAgentProcesses] = await initStep({
      name: "Preparing for agent processes...",
      progressAfter: 95,
      run: () => {
        const intervalId = setInterval(() => {
          setAgentProcesses((value) => {
            const newAgentProcesses = new Map(server.current?.agentProcesses);
            const [, areEqual] = canon.equal(
              value as unknown as SerializableValue,
              newAgentProcesses as unknown as SerializableValue,
            );
            if (areEqual) return value;
            return newAgentProcesses;
          });
        }, 1000);
        intervals.current.push(intervalId);
        return op.success();
      },
    });
    if (errPrepareAgentProcesses) return op.failure(errPrepareAgentProcesses);

    // Done
    const [errDone] = await initStep({
      name: "Done!",
      progressAfter: 100,
      run: () => {
        setTimeout(() => {
          setInitProgress(100);
        }, 50);
        return op.success();
      },
    });
    if (errDone) return op.failure(errDone);

    // Return success
    return op.success();
  }

  // Run the initialization task on mount
  useEffect(() => {
    init().then(async (result) => {
      const [error] = result;
      if (!error) return;
      telemetry.log.error({ error });
      setInitError(error.message);
      await exit();
    });
    return () => {
      exit();
    };
  }, []);

  // Add keyboard navigation
  useInput((input, key) => {
    const currentIndex = tabs.indexOf(selectedTab);
    if (key.upArrow) {
      const newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      setSelectedTab(tabs[newIndex] || "server");
    } else if (key.downArrow) {
      const newIndex = (currentIndex + 1) % tabs.length;
      setSelectedTab(tabs[newIndex] || "server");
    } else if (input.toLowerCase() === "d") {
      setDebugModeEnabled((prev) => !prev);
    } else if (input.toLowerCase() === "q" || (key.ctrl && input === "c")) {
      exit();
    }
  });

  // Update tabs and logs when agent processes change
  useEffect(() => {
    // Determine base tabs based on debug mode
    const baseTabs = options.debug ? DEFAULT_TABS : DEFAULT_TABS.filter((tab) => tab !== "cli");

    // Identify added/removed processes
    const addedProcesses = Array.from(agentProcesses.values()).filter(
      (process) => !tabs.includes(process.id),
    );
    const removedProcessesIds = tabs.filter(
      (tabId) =>
        !(
          baseTabs.includes(tabId) ||
          Array.from(agentProcesses.values()).some((process) => process.id === tabId)
        ),
    );

    // Update tabs
    setTabs([...baseTabs, ...Array.from(agentProcesses.values()).map((process) => process.id)]);

    // If the current selected tab is removed, switch to "server" tab
    if (removedProcessesIds.includes(selectedTab)) setSelectedTab("server");

    // Clean up logs of removed processes
    for (const processId of removedProcessesIds) {
      setLogs((prev) => ({ ...prev, [processId]: [] }));
    }

    // Properly capture logs of added processes
    for (const process of addedProcesses) {
      for (const channel of ["stdout", "stderr"] as const) {
        process.nodeProcess?.[channel]?.on("data", (newOutput: Buffer) => {
          const formattedLogs = cleanStdData(newOutput);
          setDebugLogs((prev) => ({
            ...prev,
            [process.id]: [...(prev[process.id] ?? []), ...formattedLogs],
          }));
          setLogs((prev) => ({
            ...prev,
            [process.id]: [...(prev[process.id] ?? []), ...formattedLogs],
          }));
          setAllLogs((prev) => [...prev, ...formattedLogs]);
        });
      }
    }
  }, [agentProcesses]);

  // Enter fullscreen mode if not in debug mode
  const isFullscreen = !debugModeEnabled && exitProgress !== 100;
  const Container = isFullscreen ? FullScreenBox : Box;

  return (
    <ThemeProvider theme={customInkUITheme}>
      <Container
        flexDirection="column"
        marginRight={debugModeEnabled ? 0 : 5}
        minHeight={isFullscreen ? (process.stdout.rows ?? 24) - 1 : undefined}
        paddingX={1}
        width="100%"
      >
        {/* Init Loader */}
        {initProgress < 100 && exitProgress === 0 && (
          <DevLoader loadingProgress={initProgress} loadingStatus={initStatus} />
        )}

        {/* Exit Loader */}
        {exitProgress > 0 && exitProgress < 100 && (
          <DevLoader loadingProgress={exitProgress} loadingStatus={exitStatus} />
        )}

        {/* Successful exit */}
        {exitProgress === 100 && !initError && (
          <Box
            alignItems="center"
            flexDirection="column"
            gap={1}
            justifyContent="center"
            margin={2}
          >
            <Box
              alignItems="center"
              borderColor="gray"
              borderStyle="round"
              justifyContent="center"
              paddingX={1}
            >
              <Text>Stopped successfully. Enjoy {chalk.hex(theme.orange)("life")}!</Text>
            </Box>
            <Text>
              <Link url="https://lifejs.org/docs">Docs</Link>
              {"    "}
              <Link url="https://github.com/lifejs/lifejs/issues">Report an issue</Link>
              {"    "}
              <Link url="https://discord.gg/U5wHjT5Ryj">Get support</Link>
            </Text>
            {!options.debug && (
              <>
                <Divider borderDimColor={true} width={40} />
                <Text dimColor={true}>Run with --debug to see logs.</Text>
              </>
            )}
          </Box>
        )}

        {/* Failure exit */}
        {exitProgress === 100 && initError && (
          <Box
            alignItems="center"
            flexDirection="column"
            gap={1}
            justifyContent="center"
            margin={2}
          >
            <Box
              alignItems="center"
              borderColor="red"
              borderStyle="round"
              justifyContent="center"
              paddingX={1}
            >
              <Text color={"red"}>Error starting the Life.js development server</Text>
            </Box>
            <Text color={"red"}>{initError}</Text>
            {!options.debug && (
              <>
                <Divider borderDimColor={true} color={"red"} width={40} />
                <Text color={"red"} dimColor={true}>
                  Run with --debug to see logs.
                </Text>
              </>
            )}
          </Box>
        )}

        {/* Main */}
        {initProgress === 100 && exitProgress === 0 && (
          <ConditionalMouseProvider enabled={!debugModeEnabled}>
            <Box flexDirection="column" height={"100%"} width="100%">
              <Box flexGrow={1} gap={1} width="100%">
                {!debugModeEnabled && server && (
                  <DevSidebar
                    agentProcesses={agentProcesses}
                    selectedTab={selectedTab}
                    tabs={tabs}
                    version={version}
                  />
                )}
                <DevContent
                  debugLogs={debugLogs}
                  debugModeEnabled={debugModeEnabled}
                  logs={logs}
                  selectedTab={selectedTab}
                />
              </Box>
              <DevFooter
                agentProcesses={agentProcesses}
                debugModeEnabled={debugModeEnabled}
                selectedTab={selectedTab}
              />
            </Box>
          </ConditionalMouseProvider>
        )}
      </Container>
      {/* Debug logs */}
      {exitProgress === 100 && initError && options.debug && (
        <Box flexDirection="column" padding={1}>
          {allLogs.length > 0 && (
            <>
              <Text>Debug logs:</Text>
              <Divider color={theme.orange} minWidth={"100%"} width="100%" />
              {allLogs.map((log, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: expected
                <Text key={`loading-log-${i}`}>{log}</Text>
              ))}
            </>
          )}
          {allLogs.length === 0 && <Text>No debug logs.</Text>}
        </Box>
      )}
    </ThemeProvider>
  );
};
