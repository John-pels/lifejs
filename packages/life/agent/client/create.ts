import clients from "life/exports/build-client";
import { AgentClient } from "./class";
import type { GeneratedAgentClient } from "./types";

export const createAgentClient = <Name extends keyof typeof clients>(
  name: Name,
  args?: { id?: string },
) => {
  if (!clients[name]) throw new Error(`Agent client ${name} not found`);
  return new AgentClient({
    definition: clients[name].definition,
    plugins: clients[name].plugins,
    id: args?.id,
  }) as unknown as GeneratedAgentClient<Name>;
};
