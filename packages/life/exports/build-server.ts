// This is placeholder code for typesafety.
// It is going to be replaced during compilation.

import type { z } from "zod";
import type { agentConfig } from "@/agent/config";
import type { AgentDefinition } from "@/agent/server/types";

type ServerBuild = Record<
  string,
  { definition: AgentDefinition; globalConfigs: z.input<typeof agentConfig.serverSchema>[] }
>;

export default {
  "If you see this, it means you haven't run `life build` or `life dev` yet.": {
    definition: {} as AgentDefinition,
    globalConfigs: [] as z.input<typeof agentConfig.serverSchema>[],
  },
} as const satisfies ServerBuild;
