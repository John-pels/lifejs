import { useStore } from "@nanostores/react";
import type { AgentClientDefinition, AgentClientWithPlugins } from "@/agent/client/types";
import type { AgentClient } from "@/exports/client";
import type { corePluginClient } from "../plugins/defaults/core/client";

export const useAgentStatus = <
  Client extends AgentClientWithPlugins<
    AgentClient<AgentClientDefinition>,
    {
      core: {
        definition: typeof corePluginClient._definition;
      };
    }
  >,
>(
  client: Client,
) => {
  if (!("core" in client))
    throw new Error("useAgentStatus() must be used with agents having the 'core' plugin.");
  const data = useStore(client.core.atoms.status);
  return { data };
};
