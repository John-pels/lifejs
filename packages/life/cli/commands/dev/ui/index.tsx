import { type ChildProcess, execSync as exec, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { defaultTheme, extendTheme, ThemeProvider } from "@inkjs/ui";
import { MouseProvider } from "@zenobius/ink-mouse";
import chalk from "chalk";
import figures from "figures";
import { Box, type BoxProps, Text, type TextProps, useInput } from "ink";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { getVersion, type VersionInfo } from "@/cli/utils/version";
import { LifeCompiler } from "@/compiler";
import { LifeServer } from "@/server";
import type { AgentProcess } from "@/server/agent-process/parent";
import { logLevelPriority } from "@/telemetry/helpers/log-level-priority";
import { formatLogForTerminal } from "@/telemetry/helpers/terminal";
import { theme } from "../../../utils/theme";
import type { DevOptions } from "../action";
import { Divider } from "../components/divider";
import { FullScreenBox } from "../components/fullscreen-box.js";
import { checkLivekitInstall } from "../helpers/check-livekit-install";
import { cleanStdData } from "../helpers/clean-std-data";
import { DEFAULT_TABS } from "../helpers/tabs";
import { DevContent } from "./content";
import { DevFooter } from "./footer";
import { DevLoader } from "./loader";
import { DevSidebar } from "./sidebar";

// Conditional wrapper for MouseProvider
const ConditionalMouseProvider = (params: { children: ReactNode; enabled: boolean }) => {
  if (params.enabled) return <MouseProvider>{params.children}</MouseProvider>;
  return <>{params.children}</>;
};

// Define a custom Ink UI theme for progress bar
const customInkUITheme = extendTheme(defaultTheme, {
  components: {
    ProgressBar: {
      styles: {
        container: (): BoxProps => ({
          flexGrow: 1,
          minWidth: 0,
        }),
        completed: (): TextProps => ({
          color: theme.orange,
        }),
        remaining: (): TextProps => ({
          dimColor: true,
        }),
      },
      config: () => ({
        completedCharacter: figures.square,
        remainingCharacter: figures.squareLightShade,
      }),
    },
  },
});

export const DevUI = ({ options }: { options: DevOptions }) => {
  const [loadingProgress, setLoadingProgress] = useState(1);
  const [loadingStatus, setLoadingStatus] = useState<string | null>("Initializing...");
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const server = useRef<LifeServer | null>(null);
  const compiler = useRef<LifeCompiler | null>(null);
  const livekitProcess = useRef<ChildProcess | null>(null);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [initLogs, setInitLogs] = useState<string[]>([]);
  const [agentProcesses, setAgentProcesses] = useState<Map<string, AgentProcess>>(new Map());

  const [debugModeEnabled, setDebugModeEnabled] = useState(false);
  const [tabs, setTabs] = useState<string[]>(DEFAULT_TABS);
  const [selectedTab, setSelectedTab] = useState("server");

  const [logs, setLogs] = useState<Record<string, string[]>>({
    server: [],
    compiler: [],
    webrtc: [],
  });
  const [debugLogs, setDebugLogs] = useState<Record<string, string[]>>({
    server: [],
    compiler: [],
    webrtc: [],
  });

  const intervals = useRef<NodeJS.Timeout[]>([]);

  async function init() {
    // Helper function to return a loading error
    const initError = async (message: string) => {
      setLoadingError(message);
      await cleanup();
      await new Promise((resolve) => setTimeout(resolve, 200));
      process.exit(1);
    };
    // Helper function to execute commands and capture output
    const executeWithLogging = async (command: string) => {
      try {
        const output = await exec(command, {
          stdio: ["pipe", "pipe", "pipe"],
        });
        if (output) {
          const lines = cleanStdData(output);
          setInitLogs((prev) => [...prev, ...lines]);
        }
        return { success: true, output: output.toString("utf-8") };
      } catch (error) {
        let errorMessage = "Command failed";
        if (error instanceof Error) {
          // Node's execSync error includes stderr property when command fails
          const execError = error as Error & { stderr?: Buffer };
          errorMessage = execError.stderr?.toString("utf-8") || error.message || "Command failed";
        }
        setInitLogs((prev) => [...prev, `Error: ${errorMessage}`]);
        return { success: false, error: errorMessage };
      }
    };

    // Retrieve server token from options or environment variable
    setLoadingStatus("Checking server token...");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const serverToken = options.token ?? process.env.LIFE_SERVER_TOKEN;
    if (!serverToken)
      return await initError(
        `Server token is required.\nUse the --token flag or set LIFE_SERVER_TOKEN environment variable.\n\nHere is one generated for you :)\n\n${chalk.bold(`LIFE_SERVER_TOKEN=${randomBytes(32).toString("base64url")}`)}\n\nJust put it in your .env file.`,
      );
    setLoadingProgress(10);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Check Livekit Server version
    setLoadingStatus("Checking LiveKit server version...");
    await new Promise((resolve) => setTimeout(resolve, 10));
    let lkInstall = await checkLivekitInstall();
    setLoadingProgress(20);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Install/Upgrade LiveKit server
    if (!lkInstall.installed) {
      setLoadingStatus("Installing LiveKit server...");
      await new Promise((resolve) => setTimeout(resolve, 10));
      // - MacOS
      if (process.platform === "darwin") {
        setInitLogs((prev) => [...prev, "Running: brew update && brew install livekit"]);
        const result = await executeWithLogging("brew update && brew install livekit");
        if (!result.success) {
          return await initError(
            "Failed to install LiveKit server via Homebrew.\nPlease install it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
          );
        }
      }
      // - Linux
      else if (process.platform === "linux") {
        setInitLogs((prev) => [...prev, "Running: curl -sSL https://get.livekit.io | bash"]);
        const result = await executeWithLogging("curl -sSL https://get.livekit.io | bash");
        if (!result.success) {
          return await initError(
            "Failed to install LiveKit server.\nPlease install it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
          );
        }
      }
      // - Windows
      else if (process.platform === "win32") {
        return await initError(
          "Server requires the 'livekit-server' command to be installed.\nAutomatic installation is not supported on Windows yet.\nPlease install it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
        );
      }
      // - Unsupported
      else {
        return await initError(
          "Server requires the 'livekit-server' command to be installed.\nAutomatic installation is not supported on this platform yet.\nPlease install it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
        );
      }

      // Check the install again
      lkInstall = await checkLivekitInstall();
      if (!lkInstall.installed) {
        return await initError(
          "Server requires the 'livekit-server' command to be installed.\nAutomatic installation failed.\nPlease install it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
        );
      }
    }

    const minLivekitVersionPrefix = "1.9";
    if (!lkInstall.version?.startsWith(minLivekitVersionPrefix)) {
      setLoadingStatus("Upgrading LiveKit server...");
      await new Promise((resolve) => setTimeout(resolve, 10));
      // - MacOS
      if (process.platform === "darwin") {
        setInitLogs((prev) => [...prev, "Running: brew update && brew upgrade livekit"]);
        const result = await executeWithLogging("brew update && brew upgrade livekit");
        if (!result.success) {
          return await initError(
            "Failed to upgrade LiveKit server via Homebrew.\nPlease upgrade it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
          );
        }
      }
      // - Linux
      else if (process.platform === "linux") {
        setInitLogs((prev) => [...prev, "Running: curl -sSL https://get.livekit.io | bash"]);
        const result = await executeWithLogging("curl -sSL https://get.livekit.io | bash");
        if (!result.success) {
          return await initError(
            "Failed to upgrade LiveKit server.\nPlease upgrade it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
          );
        }
      }
      // - Windows
      else if (process.platform === "win32") {
        return await initError(
          `Server requires the 'livekit-server' command version >= ${minLivekitVersionPrefix}.* (current version: ${lkInstall.version}).\nAutomatic upgrade is not supported on Windows yet.\nPlease upgrade it manually by visiting https://docs.livekit.io/home/self-hosting/local/`,
        );
      }
      // - Unsupported
      else {
        return await initError(
          `Server requires the 'livekit-server' command version >= ${minLivekitVersionPrefix}.* (current version: ${lkInstall.version}).\nAutomatic upgrade is not supported on this platform yet.\nPlease upgrade it manually by visiting https://docs.livekit.io/home/self-hosting/local/`,
        );
      }

      // Check the install again
      lkInstall = await checkLivekitInstall();
      if (!(lkInstall.installed && lkInstall.version?.startsWith(minLivekitVersionPrefix))) {
        return await initError(
          `Server requires the 'livekit-server' command version >= ${minLivekitVersionPrefix}.* (current version: ${lkInstall.version}).\nAutomatic upgrade failed.\nPlease upgrade it manually by visiting https://docs.livekit.io/home/self-hosting/local/`,
        );
      }
    }
    setLoadingProgress(30);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Start LiveKit server
    setLoadingStatus("Starting LiveKit server...");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const livekitServer = spawn("livekit-server", ["--dev"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    livekitProcess.current = livekitServer;

    const cleanLivekitLogs = (lines: string[]): string[] => {
      return lines
        .map((line) =>
          // Remove datetime like "2025-09-16T07:29:29.693-0700"
          line
            .replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{4}\s*/, "")
            .trim(),
        )
        .filter(Boolean);
    };

    livekitServer.stdout?.on("data", (data) => {
      const formattedLog = cleanLivekitLogs(cleanStdData(data));
      setDebugLogs((prev) => ({
        ...prev,
        webrtc: [...(prev.webrtc ?? []), ...formattedLog],
      }));
      setLogs((prev) => ({
        ...prev,
        webrtc: [...(prev.webrtc ?? []), ...formattedLog],
      }));
    });
    livekitServer.stderr?.on("data", (data) => {
      const formattedLog = cleanLivekitLogs(cleanStdData(data));
      setDebugLogs((prev) => ({
        ...prev,
        webrtc: [...(prev.webrtc ?? []), ...formattedLog],
      }));
      setLogs((prev) => ({
        ...prev,
        webrtc: [...(prev.webrtc ?? []), ...formattedLog],
      }));
    });
    setLoadingProgress(40);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Download AI models
    setLoadingStatus("Downloading AI models...");
    await new Promise((resolve) => setTimeout(resolve, 10));
    // TODO
    setLoadingProgress(50);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Obtain Life.js version
    setLoadingStatus("Checking Life.js version...");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const version_ = await getVersion();
    setVersion(version_);
    setLoadingProgress(60);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Initialize compiler
    setLoadingStatus("Initializing compiler...");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const newCompiler = new LifeCompiler({
      projectDirectory: options.root,
      outputDirectory: ".life",
      watch: true,
      optimize: true,
    });
    compiler.current = newCompiler;
    setLoadingProgress(65);
    await new Promise((resolve) => setTimeout(resolve, 10));

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

    // Start compiler
    setLoadingStatus("Starting Life.js compiler...");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const [errCompiler] = await newCompiler.start();
    if (errCompiler) return await initError(errCompiler.message);
    setLoadingProgress(70);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Initialize server
    setLoadingStatus("Initializing server...");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const newServer = new LifeServer({
      projectDirectory: options.root,
      token: serverToken,
      watch: true,
      host: options.host,
      port: options.port,
    });
    server.current = newServer;
    setLoadingProgress(75);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Consume server telemetry logs
    newServer.telemetry.registerConsumer({
      async start(queue) {
        for await (const signal of queue) {
          if (signal.type !== "log") continue;

          // Format the log
          const formattedLog = formatLogForTerminal(signal);

          // Push any log to debug logs
          setDebugLogs((prev) => ({
            ...prev,
            server: [...(prev.server ?? []), formattedLog],
          }));

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

    // Start Life.js server
    setLoadingStatus("Starting Life.js server...");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const [errServer] = await newServer.start();
    if (errServer) return await initError(errServer.message);
    setLoadingProgress(85);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Listen for agent processes changes
    setLoadingStatus("Preparing for agent processes...");
    await new Promise((resolve) => setTimeout(resolve, 10));
    const intervalId = setInterval(() => {
      setAgentProcesses(newServer.agentProcesses);
    }, 1000);
    intervals.current.push(intervalId);
    setLoadingProgress(90);
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Done
    setLoadingStatus("Done!");
    await new Promise((resolve) => setTimeout(resolve, 10));
    setTimeout(() => {
      setLoadingProgress(100);
    }, 200);

    // Reset debug logs
    setInitLogs([]);
  }

  async function cleanup() {
    await server.current?.stop();
    await compiler.current?.stop();
    livekitProcess.current?.kill();
    for (const interval of intervals.current) clearInterval(interval);
  }

  // Init
  useEffect(() => {
    init();
    return () => {
      cleanup();
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
    } else if (input.toLowerCase() === "q") {
      cleanup().then(() => {
        process.exit(0);
      });
    }
  });

  // Update tabs and logs when agent processes change
  useEffect(() => {
    // Identify added/removed processes
    const addedProcesses = Array.from(agentProcesses.values()).filter(
      (process) => !tabs.includes(process.id),
    );
    const removedProcessesIds = tabs.filter(
      (tabId) =>
        !(
          DEFAULT_TABS.includes(tabId) ||
          Array.from(agentProcesses.values()).some((process) => process.id === tabId)
        ),
    );

    // Update tabs
    setTabs([...DEFAULT_TABS, ...Array.from(agentProcesses.values()).map((process) => process.id)]);

    // If the current selected tab is removed, switch to "server" tab
    if (removedProcessesIds.includes(selectedTab)) setSelectedTab("server");

    // Clean up logs of removed processes
    for (const processId of removedProcessesIds) {
      setLogs((prev) => ({ ...prev, [processId]: [] }));
    }

    // Properly capture logs of added processes
    for (const process of addedProcesses) {
      // Telemetry logs
      process.onChildTelemetrySignal((signal) => {
        if (signal.type !== "log") return;

        // Format the log
        const formattedLog = formatLogForTerminal(signal);

        // Push any log to debug logs
        setDebugLogs((prev) => ({
          ...prev,
          [process.id]: [...(prev[process.id] ?? []), formattedLog],
        }));

        // Ignore logs lower than the requested log level
        if (logLevelPriority(signal.level) >= logLevelPriority(options.debug ? "debug" : "info")) {
          // Format and record the logs
          setLogs((prev) => ({
            ...prev,
            [process.id]: [...(prev[process.id] ?? []), formattedLog],
          }));
        }
      });

      // STDOUT
      process.nodeProcess?.stdout?.on("data", (newOutput: Buffer) => {
        const formattedLog = cleanStdData(newOutput);
        setDebugLogs((prev) => ({
          ...prev,
          [process.id]: [...(prev[process.id] ?? []), ...formattedLog],
        }));
        setLogs((prev) => ({
          ...prev,
          [process.id]: [...(prev[process.id] ?? []), ...formattedLog],
        }));
      });

      // STDERR
      process.nodeProcess?.stderr?.on("data", (newOutput: Buffer) => {
        const formattedLog = cleanStdData(newOutput);
        setDebugLogs((prev) => ({
          ...prev,
          [process.id]: [...(prev[process.id] ?? []), ...formattedLog],
        }));
        setLogs((prev) => ({
          ...prev,
          [process.id]: [...(prev[process.id] ?? []), ...formattedLog],
        }));
      });
    }
  }, [agentProcesses]);

  // Enter fullscreen mode if not in debug mode
  const Container = debugModeEnabled || loadingError ? Box : FullScreenBox;

  return (
    <ThemeProvider theme={customInkUITheme}>
      <Container
        flexDirection="column"
        marginRight={debugModeEnabled ? 0 : 5}
        minHeight={(process.stdout.rows ?? 24) - 1}
        paddingX={1}
        width="100%"
      >
        {/* Loader */}
        {loadingProgress < 100 && (
          <DevLoader
            loadingError={loadingError}
            loadingProgress={loadingProgress}
            loadingStatus={loadingStatus}
            options={options}
          />
        )}

        {/* Main */}
        {loadingProgress >= 100 && (
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
      {loadingError && options.debug && (
        <Box flexDirection="column" padding={1}>
          {initLogs.length > 0 && (
            <>
              <Text>Debug logs:</Text>
              <Divider color={theme.orange} minWidth={"100%"} width="100%" />
              {initLogs.map((log, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: expected
                <Text key={`loading-log-${i}`}>{log}</Text>
              ))}
            </>
          )}
          {initLogs.length === 0 && <Text>No debug logs.</Text>}
        </Box>
      )}
    </ThemeProvider>
  );
};
