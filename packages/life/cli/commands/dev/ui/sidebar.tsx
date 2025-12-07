import { Box, Text } from "ink";
import type { FC } from "react";
import { theme } from "@/cli/utils/theme";
import { formatVersion, type VersionInfo } from "@/cli/utils/version";
import type { AgentProcessClient } from "@/server/agent-process/client";
import { Divider } from "../components/divider";
import { DEFAULT_TABS, getSortedTabs, getTabName } from "../lib/tabs";

const getStatusIndicator = (process: AgentProcessClient) => {
  const { status, restartCount } = process;

  if (status === "running") {
    return <Text color="green">● </Text>;
  }

  if (status === "starting") {
    return <Text color={theme.level.warn}>● </Text>;
  }

  if (status === "stopping") {
    return <Text color={theme.level.warn}>● </Text>;
  }

  // status === "stopped"
  if (restartCount > 0) {
    return <Text color={theme.level.error}>● </Text>;
  }

  // Never started
  return <Text color={theme.gray.medium}>○ </Text>;
};

interface DevSidebarProps {
  version: VersionInfo | null;
  selectedTab: string;
  tabs: string[];
  agentProcesses: Map<string, AgentProcessClient>;
}

export const DevSidebar: FC<DevSidebarProps> = ({ version, selectedTab, tabs, agentProcesses }) => {
  return (
    <Box borderColor="gray" borderStyle="round" height="100%" minWidth={33} width={33}>
      <Box flexDirection="column" gap={1} width="100%">
        <Box alignItems="center" flexDirection="column" justifyContent="center" width="100%">
          {/* Header */}
          <Box
            flexDirection="row"
            justifyContent="space-between"
            paddingLeft={1}
            paddingRight={0.5}
            width="100%"
          >
            <Text color={theme.gray.medium}>
              Life.js{" "}
              <Text color={theme.orange} italic>
                Dev
              </Text>
            </Text>
            <Text>{version ? formatVersion(version).output : ""}</Text>
          </Box>
          <Divider color="gray" width="100%" />
        </Box>
        {/* Tabs */}
        <Box flexDirection="column" gap={1}>
          {/* Default Tabs */}
          <Box flexDirection="column" paddingX={2}>
            {tabs
              .filter((tab) => DEFAULT_TABS.includes(tab))
              .map((tab) => (
                <Text
                  bold={selectedTab === tab}
                  color={selectedTab === tab ? theme.orange : theme.gray.medium}
                  key={tab}
                >
                  {getTabName(tab, agentProcesses)}
                </Text>
              ))}
          </Box>
          {/* Agent Tabs */}
          <Box flexDirection="column" paddingX={2} width="100%">
            <Box flexDirection="row" gap={1}>
              <Text bold={true} color={theme.gray.medium} dimColor={true} italic={true}>
                Agents
              </Text>
              <Divider borderDimColor={true} color="gray" flexGrow={1} />
              <Text color={theme.gray.dark} italic>
                ({agentProcesses.size})
              </Text>
            </Box>
            <Box flexDirection="column" paddingLeft={2}>
              {getSortedTabs(tabs, agentProcesses)
                .filter((tab) => !DEFAULT_TABS.includes(tab))
                .map((agentId) => {
                  const process = agentProcesses.get(agentId);
                  return (
                    <Box flexDirection="row" key={agentId}>
                      {process && getStatusIndicator(process)}
                      <Text
                        bold={selectedTab === agentId}
                        color={selectedTab === agentId ? theme.orange : theme.gray.medium}
                        wrap="truncate-end"
                      >
                        {getTabName(agentId, agentProcesses)}
                      </Text>
                    </Box>
                  );
                })}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
