import chalk from "chalk";
import { Box, Text } from "ink";
import type { FC } from "react";
import { theme } from "@/cli/utils/theme";
import { formatLogForTerminal } from "@/telemetry/helpers/formatting/terminal";
import { logLevelPriority } from "@/telemetry/helpers/log-level-priority";
import type { TelemetryLog } from "@/telemetry/types";
import type { DevOptions } from "../action";
import { Divider } from "../components/divider";
import { ScrollBox } from "../components/scroll-box";
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
  const currentTabLogs = logs.filter((log) => {
    if (debugModeEnabled) return true;
    let logTab = "cli";
    if (log.scope === "server") logTab = "server";
    else if (log.scope === "compiler") logTab = "compiler";
    else if (log.scope === "webrtc") logTab = "webrtc";
    else if (
      (log.scope === "agent.server" || log.scope === "plugin.server") &&
      log.attributes?.agentId
    )
      logTab = log.attributes.agentId as string;
    if (logTab !== selectedTab) return false;
    return logLevelPriority(log.level) >= logLevelPriority(options.debug ? "debug" : "info");
  });

  return (
    <Box
      borderColor={debugModeEnabled ? undefined : "gray"}
      borderStyle={debugModeEnabled ? undefined : "round"}
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

const Logs = ({ logs, selectedTab }: { logs: TelemetryLog[]; selectedTab: string }) => {
  const hasLogs = logs.length > 0;
  const isAgentTab = !DEFAULT_TABS.includes(selectedTab);
  if (hasLogs) {
    return (logs || []).map((log) => (
      <Text key={log.id} wrap="wrap">
        {formatLogForTerminal(log)}
      </Text>
    ));
  }
  if (!hasLogs && isAgentTab) {
    return (
      <Text color={theme.gray.light} italic>
        This agent is not running.{"\n\n"}Run `{chalk.bold("agent.start()")}` on the frontend to
        start it.
      </Text>
    );
  }
  return null;
};
