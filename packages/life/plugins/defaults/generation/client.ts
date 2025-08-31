import { atom, onMount } from "nanostores";
import { definePluginClient } from "../../client/define";
import type { generationPlugin } from "./server";

// Required to not exceed the maximum length the TS compiler will serialize.
// Destructuring the definition leads to simpler values types.
export type SimplifiedGenerationPluginServer = {
  _definition: {
    name: typeof generationPlugin._definition.name;
    config: typeof generationPlugin._definition.config;
    context: typeof generationPlugin._definition.context;
    events: typeof generationPlugin._definition.events;
    methods: typeof generationPlugin._definition.methods;
    dependencies: typeof generationPlugin._definition.dependencies;
    lifecycle: typeof generationPlugin._definition.lifecycle;
    effects: typeof generationPlugin._definition.effects;
    services: typeof generationPlugin._definition.services;
    interceptors: typeof generationPlugin._definition.interceptors;
  };
};

export const generationPluginClient = definePluginClient<SimplifiedGenerationPluginServer>(
  "generation",
).atoms(({ client }) => {
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
});
