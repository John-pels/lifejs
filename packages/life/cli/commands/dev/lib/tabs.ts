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
  const agentName = agentProcesses.get(agentId)?.name ?? "unknown";
  return `${chalk.gray.italic(agentName)} (${agentId.replace("agent_", "").slice(0, 6) ?? "unknown"})`;
};
