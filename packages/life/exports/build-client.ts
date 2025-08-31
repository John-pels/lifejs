// This is placeholder code for typesafety.
// It is going to be replaced during compilation.

import type { AgentClientDefinition, AgentClientPluginsMapping } from "@/agent/client/types";

type ClientBuild = Record<
  string,
  {
    definition: AgentClientDefinition;
    plugins: AgentClientPluginsMapping;
  }
>;

export default {
  "If you see this, it means you haven't run `life build` or `life dev` yet.": {
    definition: {} as AgentClientDefinition,
    plugins: {} as AgentClientPluginsMapping,
  },
} as const satisfies ClientBuild;
