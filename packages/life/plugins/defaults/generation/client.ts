import { atom, onMount } from "nanostores";
import type { Message } from "@/shared/resources";
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
)
  .class(
    // biome-ignore lint/correctness/noUnusedFunctionParameters: used in types
    ($Types, Base) =>
      <
        _ServerConfig extends (typeof $Types)["ServerConfig"],
        _ClientConfig extends (typeof $Types)["ClientConfig"],
      >() =>
        class Client extends Base {
          continue = this.server.methods.continue;
          interrupt = this.server.methods.interrupt;
          decide = this.server.methods.decide;
          say = this.server.methods.say;
          messages = {
            create: this.server.methods.createMessage,
            update: this.server.methods.updateMessage,
            get: this.server.methods.getMessages,
          };
        },
  )
  .atoms(({ server }) => {
    // Create a status atom that observes context status changes
    const status = atom<{
      listening: boolean;
      thinking: boolean;
      speaking: boolean;
    } | null>(null);
    const messages = atom<Message[]>([]);

    // Subscribe to status changes
    onMount(status, () => {
      // Fetch initial status from context
      const [err, context] = server.context.safe.get();
      if (err) return;
      status.set(context.status);

      // Subscribe to status changes from the context
      const unsubscribe = server.context.onChange(
        (ctx) => ctx.status,
        (ctx) => status.set(ctx.status),
      );

      // Return cleanup function
      return () => unsubscribe?.();
    });

    // Subscribe to messages changes
    onMount(messages, () => {
      // Fetch initial messages from context
      const [err, context] = server.context.safe.get();
      if (err) return;
      messages.set(context.messages);

      // Subscribe to messages changes from the context
      const unsubscribe = server.context.onChange(
        (ctx) => ctx.messages,
        (ctx) => messages.set(ctx.messages),
      );

      // Return cleanup function
      return () => unsubscribe?.();
    });

    return { status, messages };
  });
