export { defineConfig } from "@/agent/config";
export { defineAgent } from "@/agent/server/define";
export { defineMemory } from "@/plugins/defaults/memories/define";
export { defineStore } from "@/plugins/defaults/stores/define";
export { definePlugin } from "@/plugins/server/define";

import { generationPlugin } from "@/plugins/defaults/generation/server";
import { memoriesPlugin } from "@/plugins/defaults/memories/server";
import { storesPlugin } from "@/plugins/defaults/stores/server";

// Explicit typing is required to avoid type size explosion with the iterator
type ServerDefaults = {
  readonly generation: typeof generationPlugin;
  readonly memories: typeof memoriesPlugin;
  readonly stores: typeof storesPlugin;
  readonly [Symbol.iterator]: () => Generator<
    typeof generationPlugin | typeof memoriesPlugin | typeof storesPlugin,
    void,
    unknown
  >;
};

export const defaults: { readonly plugins: ServerDefaults } = {
  plugins: {
    generation: generationPlugin,
    memories: memoriesPlugin,
    stores: storesPlugin,
    // Allows defaults to be used as an iterable, e.g., [...defaults.plugins]
    *[Symbol.iterator]() {
      for (const entry of Object.values(this)) yield entry;
    },
  },
} as const;
