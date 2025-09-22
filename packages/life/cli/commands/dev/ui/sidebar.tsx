import { Box, Text } from "ink";
import type { FC } from "react";
import { theme } from "@/cli/utils/theme";
import { formatVersion, type VersionInfo } from "@/cli/utils/version";
import type { AgentProcess } from "@/server/agent-process/parent";
import { Divider } from "../components/divider";
import { DEFAULT_TABS, getTabName } from "../lib/tabs";

interface DevSidebarProps {
  version: VersionInfo | null;
  selectedTab: string;
  tabs: string[];
  agentProcesses: Map<string, AgentProcess>;
}

export const DevSidebar: FC<DevSidebarProps> = ({ version, selectedTab, tabs, agentProcesses }) => {
  return (
    <Box
      borderColor="gray"
      borderStyle="round"
      height="100%"
      minWidth={37}
      // overflow="hidden"
      width={37}
    >
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
            </Box>
            <Box flexDirection="column" paddingLeft={2}>
              {tabs
                .filter((tab) => !DEFAULT_TABS.includes(tab))
                .map((agentId) => (
                  <Text
                    bold={selectedTab === agentId}
                    color={selectedTab === agentId ? theme.orange : theme.gray.medium}
                    key={agentId}
                    wrap="truncate-end"
                  >
                    {getTabName(agentId, agentProcesses)}
                  </Text>
                ))}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
