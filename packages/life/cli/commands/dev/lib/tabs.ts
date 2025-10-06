import chalk from "chalk";
import type { AgentProcessClient } from "@/server/agent-process/client";

export const DEFAULT_TABS = ["server", "compiler", "webrtc", "cli"];

export const getTabName = (
  selectedTab: string,
  agentProcesses: Map<string, AgentProcessClient>,
) => {
  // Match default tabs names
  const defaultTabName = {
    server: "Server",
    compiler: "Compiler",
    webrtc: "WebRTC",
    cli: "CLI",
  }[selectedTab];
  if (defaultTabName) return defaultTabName;

  // Match agent process names
  const agentId = selectedTab;
  const agentName = agentProcesses.get(agentId)?.definition.name ?? "unknown";
  return `${chalk.gray.italic(agentName)} (${agentId.replace("agent_", "").slice(0, 6) ?? "unknown"})`;
};

export const getSortedTabs = (
  tabs: string[],
  agentProcesses: Map<string, AgentProcessClient>,
): string[] => {
  const defaultTabs = tabs.filter((tab) => DEFAULT_TABS.includes(tab));
  const agentTabs = tabs
    .filter((tab) => !DEFAULT_TABS.includes(tab))
    .sort((a, b) => {
      const aProcess = agentProcesses.get(a);
      const bProcess = agentProcesses.get(b);

      const getPriority = (status: string | undefined) => {
        if (status === "running") return 0;
        if (status === "starting" || status === "stopping") return 1;
        return 2; // stopped
      };

      return getPriority(aProcess?.status) - getPriority(bProcess?.status);
    });

  return [...defaultTabs, ...agentTabs];
};
