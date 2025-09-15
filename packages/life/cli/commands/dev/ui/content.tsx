import { Box, Text } from "ink";
import type { FC } from "react";
import { theme } from "@/cli/utils/theme";
import { Divider } from "../components/divider";
import { ScrollBox } from "../components/scroll-box";

interface DevContentProps {
  copyMode: boolean;
  selectedTab: string;
  logs: Record<string, string[]>;
}

export const DevContent: FC<DevContentProps> = ({ copyMode, selectedTab, logs }) => {
  const renderLogs = () => {
    const currentLogs = logs[selectedTab] || [];
    // biome-ignore lint/suspicious/noArrayIndexKey: expected
    return currentLogs.map((log, index) => <Text key={`${selectedTab}-log-${index}`}>{log}</Text>);
  };

  return (
    <Box
      borderColor={copyMode ? undefined : "gray"}
      borderStyle={copyMode ? undefined : "round"}
      height="100%"
      paddingLeft={copyMode ? 0 : 1}
      width="100%"
    >
      {copyMode ? (
        <Box flexDirection="column">
          <Text>{"\n"}</Text>
          <Divider color={theme.orange} width="100%" />
          <Text>{"\n"}</Text>
          <Box flexDirection="column">{renderLogs()}</Box>
        </Box>
      ) : (
        <ScrollBox key={`${selectedTab}-scroll-box`}>{renderLogs()}</ScrollBox>
      )}
    </Box>
  );
};
