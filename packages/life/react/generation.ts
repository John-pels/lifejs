import { useStore } from "@nanostores/react";
import type { AgentClientDefinition, AgentClientWithPlugins } from "@/agent/client/types";
import type { AgentClient } from "@/exports/client";
import type { generationPluginClient } from "../plugins/defaults/generation/client";

export const useAgentGenerationStatus = <
  Client extends AgentClientWithPlugins<
    AgentClient<AgentClientDefinition>,
    {
      generation: {
        definition: typeof generationPluginClient._definition;
      };
    }
  >,
>(
  client: Client,
) => {
  if (!("core" in client))
    throw new Error("useAgentStatus() must be used with agents having the 'core' plugin.");
  const data = useStore(client.generation.atoms.status);
  return { data };
};
