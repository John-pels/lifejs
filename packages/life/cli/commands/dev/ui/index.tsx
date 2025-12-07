import type { ChildProcess } from "node:child_process";
import { ThemeProvider } from "@inkjs/ui";
import chalk from "chalk";
import { Box, Text, useInput } from "ink";
import { useCallback, useEffect, useRef, useState } from "react";
import type { VersionInfo } from "@/cli/utils/version";
import type { LifeCompiler } from "@/compiler";
import type { LifeServer } from "@/server";
import type { AgentProcessClient } from "@/server/agent-process/client";
import { canon } from "@/shared/canon";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { formatLogForTerminal } from "@/telemetry/helpers/formatting/terminal";
import type { TelemetryLog } from "@/telemetry/types";
import { theme } from "../../../utils/theme";
import type { DevOptions } from "../action";
import { ConditionalMouseProvider } from "../components/conditional-mouse-provider";
import { Divider } from "../components/divider";
import { FullScreenBox } from "../components/fullscreen-box.js";
import { Link } from "../components/link";
import { useScreenSize } from "../hooks/use-screen-size";
import { customInkUITheme } from "../lib/inkui-theme";
import { DEFAULT_TABS, getSortedTabs } from "../lib/tabs";
import { ExitTask } from "../tasks/exit";
import { InitTask } from "../tasks/init";
import { DevContent } from "./content";
import { DevFooter } from "./footer";
import { DevLoader } from "./loader";

import { DevSidebar } from "./sidebar";

export const DevUI = ({
  options,
  telemetry,
  initialTelemetryLogs,
  onTelemetryLog,
}: {
  options: DevOptions;
  telemetry: TelemetryClient;
  initialTelemetryLogs: TelemetryLog[];
  onTelemetryLog: (callback: (log: TelemetryLog) => void) => void;
}) => {
  // Logs (displayed in tabs)
  const [logs, setLogs] = useState<TelemetryLog[]>([]);
  useEffect(() => {
    // Inject initial telemetry logs (recorded before the UI is mounted)
    setLogs((prev) => [...prev, ...initialTelemetryLogs]);
    // Listen for new telemetry logs
    onTelemetryLog((log) =>
      setLogs((prev) => (prev && Array.isArray(prev) ? [...prev, log] : [log])),
    );
  }, [initialTelemetryLogs, onTelemetryLog]);

  // States
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const server = useRef<LifeServer | null>(null);
  const compiler = useRef<LifeCompiler | null>(null);
  const livekitProcess = useRef<ChildProcess | null>(null);

  // Helper function to run the exit task, and track its states
  const [exitProgress, setExitProgress] = useState(0);
  const [exitStatus, setExitStatus] = useState<string | null>("Exiting...");
  const exit = useCallback(async () => {
    const exitTask = new ExitTask({
      telemetry,
      server: server.current,
      compiler: compiler.current,
      livekitProcess: livekitProcess.current,
      listeners: {
        onProgressUpdate: setExitProgress,
        onStatusUpdate: setExitStatus,
      },
    });
    await exitTask.run();
  }, [telemetry]);

  // Initialize on mount, and track its states
  const [initProgress, setInitProgress] = useState(0);
  const [initStatus, setInitStatus] = useState<string | null>("Initializing...");
  const [initError, setInitError] = useState<string | null>(null);
  useEffect(() => {
    const initTask = new InitTask({
      telemetry,
      options,
      listeners: {
        onProgress: setInitProgress,
        onStatus: setInitStatus,
        onError: (error) => {
          telemetry.log.error({ error });
          setInitError(error);
          exit();
        },
        onVersion: setVersion,
        onServer: (s) => {
          server.current = s;
        },
        onCompiler: (c) => {
          compiler.current = c;
        },
        onLivekitProcess: (l) => {
          livekitProcess.current = l;
        },
      },
    });
    initTask.run().then(([err]) => {
      if (err) {
        telemetry.log.error({ error: err });
        setInitError(err.message);
        exit();
      }
    });
  }, [exit, options, telemetry]);

  // When debug mode is enabled, UI controls are hidden and debug logs are shown
  const [debugModeEnabled, setDebugModeEnabled] = useState(false);

  // Tabs
  const [tabs, setTabs] = useState<string[]>(
    options.debug ? DEFAULT_TABS : DEFAULT_TABS.filter((tab) => tab !== "cli"),
  );
  const [selectedTab, setSelectedTab] = useState("server");

  // Add keyboard navigation
  useInput((input, key) => {
    const sortedTabs = getSortedTabs(tabs, agentProcesses);
    const currentIndex = sortedTabs.indexOf(selectedTab);
    // Switch to previous tab on 'up'
    if (key.upArrow) {
      const newIndex = (currentIndex - 1 + sortedTabs.length) % sortedTabs.length;
      setSelectedTab(sortedTabs[newIndex] || "server");
    }
    // Switch to next tab on 'down'
    else if (key.downArrow) {
      const newIndex = (currentIndex + 1) % sortedTabs.length;
      setSelectedTab(sortedTabs[newIndex] || "server");
    }
    // Toggle debug mode on 'd'
    else if (input.toLowerCase() === "d") setDebugModeEnabled((prev) => !prev);
    // Exit on 'q' or 'ctrl+c'
    else if (input.toLowerCase() === "q" || (key.ctrl && input === "c")) exit();
  });

  // Processes
  const [agentProcesses, setAgentProcesses] = useState<Map<string, AgentProcessClient>>(new Map());
  const startProcessesMonitoring = useCallback(
    () =>
      setInterval(() => {
        setAgentProcesses((value) => {
          const currentIds = Array.from(value.keys());
          const newIds = Array.from(server.current?.agentProcesses.keys() ?? []);
          const [error, areEqual] = canon.equal(currentIds, newIds);
          if (error) telemetry.log.error({ error });
          if (!areEqual) return new Map(server.current?.agentProcesses ?? []);
          return value;
        });
      }, 500),
    [telemetry.log.error],
  );
  useEffect(() => {
    const interval = startProcessesMonitoring();
    return () => clearInterval(interval);
  }, [startProcessesMonitoring]);

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
    if (addedProcesses.length || removedProcessesIds.length) {
      setTabs([...baseTabs, ...Array.from(agentProcesses.values()).map((process) => process.id)]);
    }

    // If the current selected tab is removed, switch to "server" tab
    if (removedProcessesIds.includes(selectedTab)) setSelectedTab("server");

    // Clean up logs of removed processes
    for (const processId of removedProcessesIds) {
      setLogs((prev) => ({ ...prev, [processId]: [] }));
    }
  }, [agentProcesses, options.debug, selectedTab, tabs]);

  // Enter fullscreen mode if not in debug mode
  const isFullscreen = !debugModeEnabled && exitProgress !== 100;
  const Container = isFullscreen ? FullScreenBox : Box;
  const { height: screenHeight } = useScreenSize();

  return (
    <ThemeProvider theme={customInkUITheme}>
      <Container
        flexDirection="column"
        marginRight={debugModeEnabled ? 0 : 5}
        minHeight={isFullscreen ? screenHeight - 1 : undefined}
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
              <Box alignItems="center" flexDirection="column" justifyContent="center">
                <Divider borderDimColor={true} color={"red"} width={32} />
                <Text color={"red"} dimColor={true}>
                  Run with --debug to see logs.
                </Text>
              </Box>
            )}
          </Box>
        )}

        {/* Main */}
        {initProgress === 100 && exitProgress === 0 && (
          <ConditionalMouseProvider enabled={!debugModeEnabled}>
            <Box flexDirection="column" height={"100%"} width="100%">
              <Box flexGrow={1} gap={1} overflow="hidden" width="100%">
                {!debugModeEnabled && server && (
                  <DevSidebar
                    agentProcesses={agentProcesses}
                    selectedTab={selectedTab}
                    tabs={tabs}
                    version={version}
                  />
                )}
                <DevContent
                  debugModeEnabled={debugModeEnabled}
                  logs={logs}
                  options={options}
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
          <Text>Debug logs:</Text>
          <Divider color={theme.orange} minWidth={"100%"} width="100%" />
          {logs?.length ? (
            logs.map((log) => <Text key={log.id}>{formatLogForTerminal(log)}</Text>)
          ) : (
            <Text>No debug logs.</Text>
          )}
        </Box>
      )}
    </ThemeProvider>
  );
};
