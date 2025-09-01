export type { AgentClient } from "@/agent/client/class";
export { defineAgentClient } from "@/agent/client/define";
export { createLifeClient } from "@/client/create";
export { definePluginClient } from "@/plugins/client/define";

import { generationPluginClient } from "@/plugins/defaults/generation/client";
import { memoriesPluginClient } from "@/plugins/defaults/memories/client";
import { storesPluginClient } from "@/plugins/defaults/stores/client";

// Explicit typing is required to avoid type size explosion with the iterator
type ClientDefaults = {
  readonly generation: typeof generationPluginClient;
  readonly memories: typeof memoriesPluginClient;
  readonly stores: typeof storesPluginClient;
  readonly [Symbol.iterator]: () => Generator<
    typeof generationPluginClient | typeof memoriesPluginClient | typeof storesPluginClient,
    void,
    unknown
  >;
};

export const defaults: { readonly plugins: ClientDefaults } = {
  plugins: {
    generation: generationPluginClient,
    memories: memoriesPluginClient,
    stores: storesPluginClient,
    *[Symbol.iterator]() {
      for (const entry of Object.values(this)) yield entry;
    },
  },
} as const;
