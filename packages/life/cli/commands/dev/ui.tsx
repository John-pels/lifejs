import { defaultTheme, extendTheme, ProgressBar, ThemeProvider } from "@inkjs/ui";
import { MouseProvider } from "@zenobius/ink-mouse";
import figures from "figures";
import { Box, type BoxProps, render, Text, type TextProps, useInput } from "ink";
import React, { useEffect, useState } from "react";
import { formatVersion, getVersion, type VersionInfo } from "@/cli/utils/version";
import { newId } from "@/shared/prefixed-id";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { theme } from "../../utils/theme";
import { Divider } from "./components/divider.js";
import { FullScreenBox } from "./components/fullscreen-box.js";
import { ScrollBox } from "./components/scroll-box.js";

// import stripAnsi from "strip-ansi";
// import { agents, type ServerOutput, startLifeServer } from "../../server/dist/index.js";

/**
 * Cleans log output by stripping ANSI codes and replacing tab characters
 */
// const cleanLog = (rawOutput: Buffer): string[] => {
//   const text = rawOutput.toString("utf8");
//   const strippedText = stripAnsi(text);
//   const cleanedLines = strippedText
//     .split("\n")
//     .filter(Boolean)
//     .map((line) => line.replaceAll("\t", " "));

//   return cleanedLines;
// };

const customTheme = extendTheme(defaultTheme, {
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

export const DevelopmentCommandInterface = () => {
  const [progress, setProgress] = useState(0);
  // const [servers, setServers] = useState<ServerOutput | null>(null);
  const [selectedTab, setSelectedTab] = useState("api");
  const [copyMode, setCopyMode] = useState(false);
  const [logs, _setLogs] = useState<Record<string, string[]>>({
    api: [],
    webrtc: [],
  });
  const tabs = [
    "api",
    "webrtc",
    // ...agents.map((agent) => `agent:${agent.id}`)
  ];

  // Add keyboard navigation
  useInput((input, key) => {
    const currentIndex = tabs.indexOf(selectedTab);
    if (key.upArrow) {
      const newIndex = (currentIndex - 1 + tabs.length) % tabs.length;
      setSelectedTab(tabs[newIndex] || "api");
    } else if (key.downArrow) {
      const newIndex = (currentIndex + 1) % tabs.length;
      setSelectedTab(tabs[newIndex] || "api");
    } else if (input.toLowerCase() === "c") {
      setCopyMode((prev) => !prev);
    } else if (input.toLowerCase() === "q") {
      // if (servers?.shutdown) servers.shutdown();
      process.exit(0);
    }
  });

  useEffect(() => {
    // Simulate progress
    setTimeout(() => setProgress(20), 250);
    setTimeout(() => setProgress(40), 500);
    setTimeout(() => setProgress(60), 750);
    setTimeout(() => setProgress(80), 1000);
    setTimeout(() => setProgress(90), 1250);
    setTimeout(() => setProgress(100), 1500);

    // Start the server
    // const servers = startLifeServer();
    // setServers(servers);

    // Handle agent dispatcher logs
    // for (const [agentId, subProcess] of Object.entries(servers.processes)) {
    //   const logKey = `agent:${agentId}`;

    //   // Handle stdout
    //   subProcess.stdout?.on("data", (newOutput: Buffer) => {
    //     setLogs((prev) => ({
    //       ...prev,
    //       [logKey]: [...(prev[logKey] ?? []), ...cleanLog(newOutput)],
    //     }));
    //   });

    //   // Handle stderr
    //   subProcess.stderr?.on("data", (newOutput: Buffer) => {
    //     setLogs((prev) => ({
    //       ...prev,
    //       [logKey]: [...(prev[logKey] ?? []), ...cleanLog(newOutput)],
    //     }));
    //   });
    // }

    // // Handle API server logs
    // if (servers.apiServer) {
    //   process.servers.apiServer.stdout // Handle stdout
    //     ?.on("data", (newOutput: Buffer) => {
    //       setLogs((prev) => ({
    //         ...prev,
    //         api: [...(prev.api ?? []), ...cleanLog(newOutput)],
    //       }));
    //     });

    //   // Handle stderr
    //   servers.apiServer.stderr?.on("data", (newOutput: Buffer) => {
    //     setLogs((prev) => ({
    //       ...prev,
    //       api: [...(prev.api ?? []), ...cleanLog(newOutput)],
    //     }));
    //   });

    //   // Handle IPC messages
    //   servers.apiServer.on("message", (message) => {
    //     if (typeof message === "string") {
    //       setLogs((prev) => ({
    //         ...prev,
    //         api: [...(prev.api ?? []), message],
    //       }));
    //     }
    //   });
    // }

    // // Handle LiveKit server logs
    // if (servers.livekitServer) {
    //   // Handle stdout
    //   servers.livekitServer.stdout?.on("data", (newOutput: Buffer) => {
    //     setLogs((prev) => ({
    //       ...prev,
    //       webrtc: [...(prev.webrtc ?? []), ...cleanLog(newOutput)],
    //     }));
    //   });

    //   // Handle stderr
    //   servers.livekitServer.stderr?.on("data", (newOutput: Buffer) => {
    //     setLogs((prev) => ({
    //       ...prev,
    //       webrtc: [...(prev.webrtc ?? []), ...cleanLog(newOutput)],
    //     }));
    //   });
    // }

    return () => {
      // servers.shutdown();
    };
  }, []);

  const [version, setVersion] = useState<VersionInfo | null>(null);
  useEffect(() => {
    getVersion().then(setVersion);
  }, []);

  const renderSidebar = () => {
    return (
      <Box flexDirection="column" gap={1} width="100%">
        <Box alignItems="center" flexDirection="column" justifyContent="center" width="100%">
          <Box
            flexDirection="row"
            justifyContent="space-between"
            marginRight={version?.hasUpdate ? -1 : 0}
            paddingLeft={version?.hasUpdate ? 0 : 1}
            paddingRight={version?.hasUpdate ? 0 : 0.5}
            width="100%"
          >
            <Text color={theme.gray.medium}>
              Life.js{" "}
              <Text color={theme.orange} italic>
                Dev
              </Text>
            </Text>
            <Text>{version ? formatVersion(version).output : "..."}</Text>
          </Box>
          <Divider color="gray" width="100%" />
        </Box>
        <Box flexDirection="column" gap={1}>
          <Box flexDirection="column" paddingX={2}>
            <Text
              bold={selectedTab === "api"}
              color={selectedTab === "api" ? theme.orange : theme.gray.medium}
            >
              API
            </Text>
            <Text
              bold={selectedTab === "webrtc"}
              color={selectedTab === "webrtc" ? theme.orange : theme.gray.medium}
            >
              WebRTC
            </Text>
          </Box>
          <Box flexDirection="column" paddingX={2} width="100%">
            <Box flexDirection="row" gap={1}>
              <Text bold={true} color={theme.gray.medium} dimColor={true} italic={true}>
                Agents
              </Text>
              <Divider borderDimColor={true} color="gray" flexGrow={1} />
            </Box>
            <Box flexDirection="column" paddingLeft={2}>
              <Text
                bold={selectedTab === "agent:1"}
                color={selectedTab === "agent:1" ? theme.orange : theme.gray.medium}
                key={1}
                wrap="truncate-end"
              >
                <Text color="gray" italic>
                  (example){" "}
                </Text>
                {newId("agent").replace("agent_", "").slice(0, 6)}
              </Text>
            </Box>
            {/* <Box flexDirection="column" paddingLeft={2}>
              {agents.map((agent) => (
                <Text
                  bold={selectedTab === `agent:${agent.id}`}
                  color={selectedTab === `agent:${agent.id}` ? theme.orange : theme.gray.medium}
                  key={agent.id}
                >
                  {agent.id}
                </Text>
              ))}
            </Box> */}
          </Box>
        </Box>
      </Box>
    );
  };

  const renderContent = () => {
    const currentLogs = logs[selectedTab] || logs[selectedTab.replace("agent:", "")] || [];
    // biome-ignore lint/suspicious/noArrayIndexKey: reason
    return currentLogs.map((log, i) => <Text key={i}>{log}</Text>);
  };

  const renderFooter = () => {
    return (
      <>
        {copyMode && (
          <Box
            borderColor={theme.orange}
            borderStyle="doubleSingle"
            marginTop={5}
            paddingX={2}
            paddingY={1}
            width="100%"
          >
            <Text>
              You entered <Text color={theme.orange}>copy mode</Text>. This removes the sidebar,
              boxes, and scroll constraints, so you can freely copy your logs. Press{" "}
              <Text color={theme.orange}>c</Text> again to exit copy mode.
            </Text>
          </Box>
        )}
        <Box
          alignItems="center"
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
          borderStyle="round"
          borderTop={copyMode}
          borderTopColor="gray"
          flexShrink={0}
          justifyContent="space-between"
          paddingX={2}
          width="100%"
        >
          <Text color="gray">
            <Text bold color={theme.orange}>
              ↑/↓
            </Text>
            : Sidebar options
          </Text>
          <Text color="gray">
            <Text bold color={theme.orange}>
              c
            </Text>
            : {copyMode ? "Exit copy Mode" : "Copy mode"}
          </Text>
          <Text color="gray">
            <Text bold color={theme.orange}>
              CTRL-C/q
            </Text>
            : Quit
          </Text>
        </Box>
      </>
    );
  };

  const Container = copyMode ? Box : FullScreenBox;

  return (
    <ThemeProvider theme={customTheme}>
      <Container flexDirection="column" marginRight={5} paddingX={1} width="100%">
        {(progress < 100 && (
          <Box
            alignItems="center"
            borderColor="gray"
            borderStyle="round"
            flexDirection="column"
            gap={1}
            height="100%"
            justifyContent="center"
            width="100%"
          >
            <Text color={theme.orange}>Life.js</Text>
            <Box width={40}>
              <ProgressBar value={progress} />
            </Box>
          </Box>
        )) || (
          <Box flexDirection="column" height={"100%"} width="100%">
            <Box flexGrow={1} gap={1} width="100%">
              {!copyMode && (
                <Box
                  borderColor="gray"
                  borderStyle="round"
                  height="100%"
                  minWidth={35}
                  overflow="hidden"
                  width="25%"
                >
                  {renderSidebar()}
                </Box>
              )}
              <Box
                borderColor={copyMode ? undefined : "gray"}
                borderStyle={copyMode ? undefined : "round"}
                height="100%"
                paddingLeft={copyMode ? 0 : 1}
                width="100%"
              >
                {copyMode ? (
                  <Box flexDirection="column">{renderContent()}</Box>
                ) : (
                  <MouseProvider>
                    <ScrollBox key={`${selectedTab}-scroll-box`}>{renderContent()}</ScrollBox>
                  </MouseProvider>
                )}
              </Box>
            </Box>
            {renderFooter()}
          </Box>
        )}
      </Container>
    </ThemeProvider>
  );
};

export interface DevOptions {
  port?: string;
  host?: string;
  tui?: boolean;
  config?: string;
}

export const executeDev = (_telemetry: TelemetryClient, options: DevOptions = {}) => {
  // If --no-tui is passed, run without TUI
  if (options.tui === false) {
    console.log("Starting Life.js development server...");
    console.log(`Server: http://${options.host || "localhost"}:${options.port || "3000"}`);
    console.log("\nPress Ctrl+C to stop\n");

    // TODO: Implement non-TUI dev server
    // For now, keep the process running
    process.stdin.resume();
    process.on("SIGINT", () => {
      console.log("\nShutting down...");
      process.exit(0);
    });
    return;
  }

  // Default: run with TUI
  render(React.createElement(DevelopmentCommandInterface, options), { exitOnCtrlC: true });
};

// /*──────── 3. LiveKit (dev only) ──────*/
// let livekitServer: ChildProcess | undefined;
// if (dev) {
//   try {
//     execSync("livekit-server --version", { stdio: "ignore" });
//   } catch {
//     console.log("Installing LiveKit …");
//     // MacOS
//     execSync("brew update && brew install livekit", { stdio: "inherit" });
//   }
//   console.log("Starting LiveKit on ws://127.0.0.1:7880");
//   livekitServer = spawn("livekit-server", ["--dev"], {
//     stdio: ["ignore", "pipe", "pipe"],
//   });
// }
