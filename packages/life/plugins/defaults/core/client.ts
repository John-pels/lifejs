import { atom, onMount } from "nanostores";
import { definePluginClient } from "../../client/define";
import type { corePlugin } from "./server";

// Required to not exceed the maximum length the TS compiler will serialize.
// Destructuring the definition leads to simpler values types.
export type SimplifiedCorePluginServer = {
  _definition: {
    name: typeof corePlugin._definition.name;
    config: typeof corePlugin._definition.config;
    context: typeof corePlugin._definition.context;
    events: typeof corePlugin._definition.events;
    methods: typeof corePlugin._definition.methods;
    dependencies: typeof corePlugin._definition.dependencies;
    lifecycle: typeof corePlugin._definition.lifecycle;
    effects: typeof corePlugin._definition.effects;
    services: typeof corePlugin._definition.services;
    interceptors: typeof corePlugin._definition.interceptors;
  };
};

export const corePluginClient = definePluginClient<SimplifiedCorePluginServer>("core").atoms(
  ({ client }) => {
    // Create a status atom that observes context status changes
    const status = atom<{
      listening: boolean;
      thinking: boolean;
      speaking: boolean;
    } | null>(null);

    // Subscribe to context changes when the atom is mounted
    onMount(status, () => {
      // Fetch initial status from context
      status.set(client.context.get().status);

      // Subscribe to status changes from the context
      const unsubscribe = client.context.onChange(
        (ctx) => ctx.status,
        (newStatus) => status.set(newStatus),
      );

      // Return cleanup function
      return () => unsubscribe?.();
    });

    return { status };
  },
);
