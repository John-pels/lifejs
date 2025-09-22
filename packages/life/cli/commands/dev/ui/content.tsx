import { Box, Text } from "ink";
import type { FC } from "react";
import { theme } from "@/cli/utils/theme";
import { Divider } from "../components/divider";
import { ScrollBox } from "../components/scroll-box";

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
            {(debugLogs[selectedTab] || []).map((log, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: expected
              <Text key={`${selectedTab}-log-${index}`} wrap="wrap">
                {log}
              </Text>
            ))}
          </Box>
        </Box>
      ) : (
        <ScrollBox flexDirection="column" key={`${selectedTab}-scroll-box`} width={"100%"}>
          {(logs[selectedTab] || []).map((log, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: expected
            <Text key={`${selectedTab}-log-${index}`} wrap="wrap">
              {log}
            </Text>
          ))}
        </ScrollBox>
      )}
    </Box>
  );
};
