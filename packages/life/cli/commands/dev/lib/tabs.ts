import chalk from "chalk";
import type { AgentProcess } from "@/server/agent-process/parent";

export const DEFAULT_TABS = ["server", "compiler", "webrtc"];

export const getTabName = (selectedTab: string, agentProcesses: Map<string, AgentProcess>) => {
  // Match default tabs names
  const defaultTabName = {
    server: "Server",
    compiler: "Compiler",
    webrtc: "WebRTC",
  }[selectedTab];
  if (defaultTabName) return defaultTabName;

  // Match agent process names
  const agentId = selectedTab;
  const agentName = agentProcesses.get(agentId)?.name ?? "unknown";
  return `${chalk.gray.italic(agentName)} (${agentId.replace("agent_", "").slice(0, 6) ?? "unknown"})`;
};
