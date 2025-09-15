import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { defaultTheme, extendTheme, ThemeProvider } from "@inkjs/ui";
import { MouseProvider } from "@zenobius/ink-mouse";
import chalk from "chalk";
import figures from "figures";
import { Box, type BoxProps, type TextProps, useInput } from "ink";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { getVersion, type VersionInfo } from "@/cli/utils/version";
import { LifeServer } from "@/server";
import type { AgentProcess } from "@/server/agent-process/parent";
import type { TelemetryClient } from "@/telemetry/clients/base";
import stripAnsi from "@/telemetry/helpers/strip-ansi";
import { formatLogForTerminal } from "@/telemetry/helpers/terminal";
import { theme } from "../../../utils/theme";
import type { DevOptions } from "../action";
import { FullScreenBox } from "../components/fullscreen-box.js";
import { DevContent } from "./content";
import { DevFooter } from "./footer";
import { DevLoader } from "./loader";
import { DevSidebar } from "./sidebar";

// Conditional wrapper for MouseProvider
const ConditionalMouseProvider = (params: { children: ReactNode; enabled: boolean }) => {
  if (params.enabled) return <MouseProvider>{params.children}</MouseProvider>;
  return <>{params.children}</>;
};

/**
 * Cleans log output by stripping ANSI codes and replacing tab characters
 */
const cleanStdData = (rawOutput: Buffer): string[] => {
  const text = rawOutput.toString("utf8");
  const strippedText = stripAnsi(text);
  const cleanedLines = strippedText
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replaceAll("\t", " "));
  return cleanedLines;
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

export const DevUI = ({
  options,
  telemetry,
}: {
  options: DevOptions;
  telemetry: TelemetryClient;
}) => {
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [server, setServer] = useState<LifeServer | null>(null);
  const [agentProcesses, setAgentProcesses] = useState<Map<string, AgentProcess>>(new Map());

  const [copyMode, setCopyMode] = useState(false);
  const [tabs, setTabs] = useState<string[]>(DEFAULT_TABS);
  const [selectedTab, setSelectedTab] = useState("server");
  const [logs, setLogs] = useState<Record<string, string[]>>({ server: [], webrtc: [] });

  const intervals = useRef<NodeJS.Timeout[]>([]);

  async function init() {
    // Retrieve server token from options or environment variable
    const serverToken = options.token ?? process.env.LIFE_SERVER_TOKEN;
    if (!serverToken) {
      setLoadingError(
        `Server token is required.\nUse the --token flag or set LIFE_SERVER_TOKEN environment variable.\n\nHere is one generated for you :)\n\n${chalk.bold(`LIFE_SERVER_TOKEN=${randomBytes(32).toString("base64url")}`)}\n\nJust put it in your .env file.`,
      );
      return;
    }
    setLoadingProgress(10);

    // Check Livekit Server version
    setLoadingStatus("Checking LiveKit server version...");
    // TODO
    setLoadingProgress(20);

    // Download LiveKit server if not installed
    setLoadingStatus("Installing LiveKit server...");
    //     console.log("Installing LiveKit …");
    //     // MacOS
    //     execSync("brew update && brew install livekit", { stdio: "inherit" });
    setLoadingProgress(20);

    // Upgrade LiveKit server if outdated
    setLoadingStatus("Upgrading LiveKit server...");
    // TODO
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
    setLoadingProgress(30);

    // Download AI models
    setLoadingStatus("Downloading AI models...");
    // TODO
    setLoadingProgress(40);

    // Obtain Life.js version
    setLoadingStatus("Checking Life.js version...");
    const version_ = await getVersion();
    setVersion(version_);
    setLoadingProgress(50);

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
    setLoadingProgress(60);

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
      telemetry.log.error({
        message: "An error occurred while starting the development server.",
        error: errStart,
      });
    setLoadingProgress(70);

    // Listen for agent processes changes
    setLoadingStatus("Preparing for agent processes...");
    const intervalId = setInterval(() => {
      setAgentProcesses(newServer.agentProcesses);
    }, 1000);
    intervals.current.push(intervalId);
    setLoadingProgress(80);

    // Done
    setLoadingStatus("Done!");
    setLoadingProgress(90);
    setTimeout(() => {
      setLoadingProgress(100);
    }, 200);
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
  const Container = copyMode ? Box : FullScreenBox;

  return (
    <ThemeProvider theme={customInkUITheme}>
      <Container flexDirection="column" marginRight={5} paddingX={1} width="100%">
        {/* Loader */}
        {loadingProgress < 100 && (
          <DevLoader
            loadingProgress={loadingProgress}
            loadingStatus={loadingStatus}
            loadingError={loadingError}
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
    </ThemeProvider>
  );
};
