import type { AgentScope } from "@/agent/server/types";
import type { AgentProcess } from "./agent-process/parent";

export interface HandshakeSession {
  agentName: string;
  scope: AgentScope;
  transportRoom: string;
  token: string;
  createdAt: number;
}

export interface AgentInstance {
  process: AgentProcess;
  scope: AgentScope;
  handshakeToken?: string;
}
