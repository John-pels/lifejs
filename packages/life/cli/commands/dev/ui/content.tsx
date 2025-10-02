import chalk from "chalk";
import { Box, Text } from "ink";
import type { FC } from "react";
import { theme } from "@/cli/utils/theme";
import { Divider } from "../components/divider";
import { ScrollBox } from "../components/scroll-box";
import { DEFAULT_TABS } from "../lib/tabs";

interface DevContentProps {
  debugModeEnabled: boolean;
  selectedTab: string;
  logs: Record<string, string[]>;
  debugLogs: Record<string, string[]>;
}

export const DevContent: FC<DevContentProps> = ({
  debugModeEnabled,
  selectedTab,
  logs,
  debugLogs,
}) => {
  const currentTabLogs = (debugModeEnabled ? debugLogs[selectedTab] : logs[selectedTab]) ?? [];

  return (
    <Box
      borderColor={debugModeEnabled ? undefined : "gray"}
      borderStyle={debugModeEnabled ? undefined : "round"}
      height="100%"
      paddingLeft={debugModeEnabled ? 0 : 1}
      width="100%"
    >
      {debugModeEnabled ? (
        <Box flexDirection="column" gap={1} width="100%">
          <Box alignItems="center" flexDirection="column" justifyContent="center" width="100%">
            <Divider color={theme.orange} width="100%" />
          </Box>
          <Box flexDirection="column">
            <Logs logs={currentTabLogs} selectedTab={selectedTab} />
          </Box>
        </Box>
      ) : (
        <ScrollBox flexDirection="column" key={`${selectedTab}-scroll-box`} width={"100%"}>
          <Logs logs={currentTabLogs} selectedTab={selectedTab} />
        </ScrollBox>
      )}
    </Box>
  );
};

const Logs = ({ logs, selectedTab }: { logs: string[]; selectedTab: string }) => {
  const hasLogs = logs.length > 0;
  const isAgentTab = !DEFAULT_TABS.includes(selectedTab);
  return (
    <>
      {hasLogs
        ? (logs || []).map((log, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: expected
            <Text key={`${selectedTab}-log-${index}`} wrap="wrap">
              {log}
            </Text>
          ))
        : null}
      {!hasLogs && isAgentTab ? (
        <Text color={theme.gray.light} italic>
          This agent running.{"\n\n"}Run `{chalk.bold("agent.start()")}` on the frontend to start
          it.
        </Text>
      ) : null}
    </>
  );
};
