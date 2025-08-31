export { AgentClient } from "@/agent/client/class";
export { createAgentClient } from "@/agent/client/create";
export { defineAgentClient } from "@/agent/client/define";
export { definePluginClient } from "@/plugins/client/define";

import { corePluginClient } from "@/plugins/defaults/core/client";
import { memoriesPluginClient } from "@/plugins/defaults/memories/client";
import { storesPluginClient } from "@/plugins/defaults/stores/client";

// Explicit typing is required to avoid type size explosion with the iterator
type ClientDefaults = {
  readonly core: typeof corePluginClient;
  readonly memories: typeof memoriesPluginClient;
  readonly stores: typeof storesPluginClient;
  readonly [Symbol.iterator]: () => Generator<
    typeof corePluginClient | typeof memoriesPluginClient | typeof storesPluginClient,
    void,
    unknown
  >;
};

export const defaults: { readonly plugins: ClientDefaults } = {
  plugins: {
    core: corePluginClient,
    memories: memoriesPluginClient,
    stores: storesPluginClient,
    *[Symbol.iterator]() {
      for (const entry of Object.values(this)) yield entry;
    },
  },
} as const;
