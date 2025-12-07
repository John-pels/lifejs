import chalk from "chalk";
import { Box, Text } from "ink";
import { type FC, useMemo } from "react";
import { theme } from "@/cli/utils/theme";
import { formatLogForTerminal } from "@/telemetry/helpers/formatting/terminal";
import type { TelemetryLog } from "@/telemetry/types";
import type { DevOptions } from "../action";
import { Divider } from "../components/divider";
import { ScrollTextBox } from "../components/scroll-text-box";
import { filterTabLogs } from "../lib/filter-tab-logs";
import { DEFAULT_TABS } from "../lib/tabs";

interface DevContentProps {
  options: DevOptions;
  debugModeEnabled: boolean;
  selectedTab: string;
  logs: TelemetryLog[];
}

export const DevContent: FC<DevContentProps> = ({
  debugModeEnabled,
  selectedTab,
  logs,
  options,
}) => {
  const currentTabLogs = filterTabLogs(
    logs,
    selectedTab,
    options.debug || debugModeEnabled ? "debug" : "info",
  );
  const formattedLogs = useMemo(
    () => currentTabLogs.map((log) => formatLogForTerminal(log)),
    [currentTabLogs],
  );
  const showEmptyPlaceholder = !(currentTabLogs.length || DEFAULT_TABS.includes(selectedTab));
  const emptyPlaceholder = useMemo(
    () => (
      <Text color={theme.gray.light} italic>
        This agent is not running.{"\n\n"}Run `{chalk.bold("agent.start()")}` on the frontend to
        start it.
      </Text>
    ),
    [],
  );

  return (
    <Box
      borderColor={debugModeEnabled ? undefined : "gray"}
      borderStyle={debugModeEnabled ? undefined : "round"}
      paddingLeft={debugModeEnabled ? 0 : 1}
      width="100%"
    >
      {debugModeEnabled && (
        <Box flexDirection="column" gap={1} width="100%">
          <Box alignItems="center" flexDirection="column" justifyContent="center" width="100%">
            <Divider color={theme.orange} width="100%" />
          </Box>
          <Box flexDirection="column">
            {showEmptyPlaceholder ? (
              emptyPlaceholder
            ) : (
              <Text wrap="wrap">{formattedLogs.join("\n")}</Text>
            )}
          </Box>
        </Box>
      )}
      {!debugModeEnabled &&
        (showEmptyPlaceholder ? (
          emptyPlaceholder
        ) : (
          <ScrollTextBox key={`tab-${selectedTab}`} lines={formattedLogs} width={"100%"} />
        ))}
    </Box>
  );
};
