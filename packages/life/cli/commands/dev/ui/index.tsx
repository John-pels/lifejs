import { execSync, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { defaultTheme, extendTheme, ThemeProvider } from "@inkjs/ui";
import { MouseProvider } from "@zenobius/ink-mouse";
import chalk from "chalk";
import figures from "figures";
import { Box, type BoxProps, Text, type TextProps, useInput } from "ink";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { getVersion, type VersionInfo } from "@/cli/utils/version";
import { LifeServer } from "@/server";
import type { AgentProcess } from "@/server/agent-process/parent";
import { formatLogForTerminal } from "@/telemetry/helpers/terminal";
import { theme } from "../../../utils/theme";
import type { DevOptions } from "../action";
import { Divider } from "../components/divider";
import { FullScreenBox } from "../components/fullscreen-box.js";
import { checkLivekitInstall } from "../helpers/check-livekit-install";
import { cleanStdData } from "../helpers/clean-std-data";
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

export const DEFAULT_TABS = ["server", "webrtc"];

export const DevUI = ({ options }: { options: DevOptions }) => {
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [server, setServer] = useState<LifeServer | null>(null);
  const [agentProcesses, setAgentProcesses] = useState<Map<string, AgentProcess>>(new Map());

  const [copyMode, setCopyMode] = useState(false);
  const [tabs, setTabs] = useState<string[]>(DEFAULT_TABS);
  const [selectedTab, setSelectedTab] = useState("server");
  const [logs, setLogs] = useState<Record<string, string[]>>({ server: [], webrtc: [] });

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
    const executeWithLogging = (command: string) => {
      try {
        const output = execSync(command, {
          stdio: ["pipe", "pipe", "pipe"],
        });
        if (output) {
          const lines = cleanStdData(output);
          setDebugLogs((prev) => [...prev, ...lines]);
        }
        return { success: true, output: output.toString("utf-8") };
      } catch (error) {
        let errorMessage = "Command failed";
        if (error instanceof Error) {
          // Node's execSync error includes stderr property when command fails
          const execError = error as Error & { stderr?: Buffer };
          errorMessage = execError.stderr?.toString("utf-8") || error.message || "Command failed";
        }
        setDebugLogs((prev) => [...prev, `Error: ${errorMessage}`]);
        return { success: false, error: errorMessage };
      }
    };

    // Retrieve server token from options or environment variable
    const serverToken = options.token ?? process.env.LIFE_SERVER_TOKEN;
    if (!serverToken)
      return await initError(
        `Server token is required.\nUse the --token flag or set LIFE_SERVER_TOKEN environment variable.\n\nHere is one generated for you :)\n\n${chalk.bold(`LIFE_SERVER_TOKEN=${randomBytes(32).toString("base64url")}`)}\n\nJust put it in your .env file.`,
      );
    setLoadingProgress(10);

    // Check Livekit Server version
    setLoadingStatus("Checking LiveKit server version...");
    let lkInstall = await checkLivekitInstall();
    setLoadingProgress(20);

    // Install/Upgrade LiveKit server
    if (!lkInstall.installed) {
      setLoadingStatus("Installing LiveKit server...");
      // - MacOS
      if (process.platform === "darwin") {
        setDebugLogs((prev) => [...prev, "Running: brew update && brew install livekit"]);
        const result = executeWithLogging("brew update && brew install livekit");
        if (!result.success) {
          return await initError(
            "Failed to install LiveKit server via Homebrew.\nPlease install it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
          );
        }
      }
      // - Linux
      else if (process.platform === "linux") {
        setDebugLogs((prev) => [...prev, "Running: curl -sSL https://get.livekit.io | bash"]);
        const result = executeWithLogging("curl -sSL https://get.livekit.io | bash");
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

    const minLivekitVersionPrefix = "1.10";
    if (!lkInstall.version?.startsWith(minLivekitVersionPrefix)) {
      setLoadingStatus("Upgrading LiveKit server...");
      // - MacOS
      if (process.platform === "darwin") {
        setDebugLogs((prev) => [...prev, "Running: brew update && brew upgrade livekit"]);
        const result = executeWithLogging("brew update && brew upgrade livekit");
        if (!result.success) {
          return await initError(
            "Failed to upgrade LiveKit server via Homebrew.\nPlease upgrade it manually by visiting https://docs.livekit.io/home/self-hosting/local/",
          );
        }
      }
      // - Linux
      else if (process.platform === "linux") {
        setDebugLogs((prev) => [...prev, "Running: curl -sSL https://get.livekit.io | bash"]);
        const result = executeWithLogging("curl -sSL https://get.livekit.io | bash");
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

    // Start LiveKit server
    setLoadingStatus("Starting LiveKit server...");
    const livekitServer = spawn("livekit-server", ["--dev"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    livekitServer.stdout?.on("data", (data) => {
      logInTab("webrtc", cleanStdData(data));
    });
    livekitServer.stderr?.on("data", (data) => {
      logInTab("webrtc", cleanStdData(data));
    });
    setLoadingProgress(40);

    // Download AI models
    setLoadingStatus("Downloading AI models...");
    // TODO
    setLoadingProgress(50);

    // Obtain Life.js version
    setLoadingStatus("Checking Life.js version...");
    const version_ = await getVersion();
    setVersion(version_);
    setLoadingProgress(60);

    // Initialize server
    setLoadingStatus("Initializing server...");
    const newServer = new LifeServer({
      projectDirectory: options.root,
      token: serverToken,
      watch: true,
      host: options.host,
      port: options.port,
    });
    setServer(newServer);
    setLoadingProgress(70);

    // Consume server telemetry logs
    newServer.telemetry.registerConsumer({
      async start(queue) {
        for await (const item of queue) {
          if (item.type !== "log") return;
          setLogs((prev) => ({
            ...prev,
            server: [...(prev.server ?? []), formatLogForTerminal(item)],
          }));
        }
      },
    });

    // Start Life.js server
    setLoadingStatus("Starting Life.js server...");
    const [errStart] = await newServer.start();
    if (errStart)
      setLoadingError(
        `An error occurred while starting the development server.\nError: ${errStart.message}`,
      );
    setLoadingProgress(80);

    // Listen for agent processes changes
    setLoadingStatus("Preparing for agent processes...");
    const intervalId = setInterval(() => {
      setAgentProcesses(newServer.agentProcesses);
    }, 1000);
    intervals.current.push(intervalId);
    setLoadingProgress(90);

    // Done
    setLoadingStatus("Done!");
    setTimeout(() => {
      setLoadingProgress(100);
    }, 200);

    // Reset debug logs
    setDebugLogs([]);
  }

  async function cleanup() {
    await server?.stop();
    for (const interval of intervals.current) clearInterval(interval);
  }

  // Init
  useEffect(() => {
    init();
    return () => {
      cleanup();
    };
  }, []);

  // Helper to log in a tab
  const logInTab = (tabId: string, message: string | string[]) => {
    setLogs((prev) => ({
      ...prev,
      [tabId]: [...(prev[tabId] ?? []), ...(Array.isArray(message) ? message : [message])],
    }));
  };

  // Add keyboard navigation
  useInput((input, key) => {
    const currentIndex = tabs.indexOf(selectedTab);
    if (key.upArrow) {
      const newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      setSelectedTab(tabs[newIndex] || "server");
    } else if (key.downArrow) {
      const newIndex = (currentIndex + 1) % tabs.length;
      setSelectedTab(tabs[newIndex] || "server");
    } else if (input.toLowerCase() === "c") {
      setCopyMode((prev) => !prev);
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
        logInTab(process.id, formatLogForTerminal(signal));
      });
      // STDOUT
      process.nodeProcess?.stdout?.on("data", (newOutput: Buffer) => {
        logInTab(process.id, cleanStdData(newOutput));
      });
      // STDERR
      process.nodeProcess?.stderr?.on("data", (newOutput: Buffer) => {
        logInTab(process.id, cleanStdData(newOutput));
      });
    }
  }, [agentProcesses]);

  // Enter fullscreen mode if not in copy mode
  const Container = copyMode || loadingError ? Box : FullScreenBox;

  return (
    <ThemeProvider theme={customInkUITheme}>
      <Container flexDirection="column" marginRight={5} paddingX={1} width="100%">
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
          <ConditionalMouseProvider enabled={!copyMode}>
            <Box flexDirection="column" height={"100%"} width="100%">
              <Box flexGrow={1} gap={1} width="100%">
                {!copyMode && server && (
                  <DevSidebar
                    agentProcesses={agentProcesses}
                    selectedTab={selectedTab}
                    tabs={tabs}
                    version={version}
                  />
                )}
                <DevContent copyMode={copyMode} logs={logs} selectedTab={selectedTab} />
              </Box>
              <DevFooter copyMode={copyMode} />
            </Box>
          </ConditionalMouseProvider>
        )}
      </Container>
      {loadingError && options.debug && (
        <Box flexDirection="column" padding={1}>
          {debugLogs.length > 0 && (
            <>
              <Text>Debug logs:</Text>
              <Divider color={theme.orange} minWidth={"100%"} width="100%" />
              {debugLogs.map((log, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: expected
                <Text key={`loading-log-${i}`}>{log}</Text>
              ))}
            </>
          )}
          {debugLogs.length === 0 && <Text>No debug logs.</Text>}
        </Box>
      )}
    </ThemeProvider>
  );
};
