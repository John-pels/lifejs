import chalk from "chalk";
import { Box, Text } from "ink";
import type { FC } from "react";
import { theme } from "@/cli/utils/theme";
import type { AgentProcessClient } from "@/server/agent-process/client";
import { getTabName } from "../lib/tabs";

interface DevFooterProps {
  debugModeEnabled: boolean;
  selectedTab: string;
  agentProcesses: Map<string, AgentProcessClient>;
}

export const DevFooter: FC<DevFooterProps> = ({
  debugModeEnabled,
  selectedTab,
  agentProcesses,
}) => {
  return (
    // flexShrink={0} is needed to prevent the footer from sometimes shrinking when the content is too long
    <Box flexDirection="column" flexShrink={0} width="100%">
      {debugModeEnabled && (
        <Box alignItems="center" justifyContent="flex-end" marginTop={5} width="100%">
          <Box borderColor={"gray"} borderStyle={"round"} paddingX={1}>
            <Text>Current Tab: {chalk.bold(getTabName(selectedTab, agentProcesses))}</Text>
          </Box>
        </Box>
      )}
      {debugModeEnabled && (
        <Box
          alignItems="center"
          borderColor={theme.orange}
          borderStyle="doubleSingle"
          justifyContent="center"
          paddingX={2}
          paddingY={1}
          width="100%"
        >
          <Text>
            You entered <Text color={theme.orange}>debug mode</Text>. UI controls are hidden so you
            can freely copy your logs. Press <Text color={theme.orange}>d</Text> again to exit debug
            mode.
          </Text>
        </Box>
      )}
      <Box
        alignItems="center"
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderStyle="round"
        borderTop={debugModeEnabled}
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
          : Switch tabs
        </Text>
        <Text color="gray">
          <Text bold color={theme.orange}>
            d
          </Text>
          : {debugModeEnabled ? "Exit debug mode" : "Debug mode"}
        </Text>
        <Text color="gray">
          <Text bold color={theme.orange}>
            CTRL-C/q
          </Text>
          : Quit
        </Text>
      </Box>
    </Box>
  );
};
