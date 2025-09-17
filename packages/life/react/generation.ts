"use client";

import { useStore } from "@nanostores/react";
import { atom } from "nanostores";
import type { AgentClientDefinition, AgentClientWithPlugins } from "@/agent/client/types";
import type { AgentClient } from "@/exports/client";
import type { generationPluginClient } from "../plugins/defaults/generation/client";

type AgentWithGenerationPlugin = AgentClientWithPlugins<
  AgentClient<AgentClientDefinition>,
  {
    generation: {
      definition: typeof generationPluginClient._definition;
    };
  }
>;

/**
 * ('generation' plugin) Reactively consume context.status.
 *
 * @param agentClient - AgentClient instance
 * @example
 * ```typescript
 * const status = useAgentStatus(agent); // { listening: boolean; thinking: boolean; speaking: boolean } | null
 * console.log(status);
 * console.log(status?.listening);
 * ```
 */
export const useAgentStatus = <Client extends AgentWithGenerationPlugin | null>(
  agentClient: Client,
) => {
  const data = useStore(agentClient?.generation.atoms.status ?? atom(null));
  if (agentClient && !("generation" in agentClient))
    throw new Error("useAgentStatus() must be used with agents having the 'generation' plugin.");
  return data;
};

export const useAgentMessages = <Client extends AgentWithGenerationPlugin | null>(
  agentClient: Client,
) => {
  const data = useStore(agentClient?.generation.atoms.messages ?? atom([]));
  if (agentClient && !("generation" in agentClient))
    throw new Error("useAgentMessages() must be used with agents having the 'generation' plugin.");
  return data;
};
