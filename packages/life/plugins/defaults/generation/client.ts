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

    server.methods.continue({});
    // @ts-expect-error
    server.methods.continuenot({});

    // --------------
    server.events.on(
      {
        include: ["messages.create", "messages.update", "agent.decide"],
        exclude: ["messages.create", "messages.update"],
      },
      (event) => {
        event.type;
      },
    );
    server.events.on("*", (event) => {
      event.type;
    });
    server.events.on("messages.create", (event) => {
      event.type;
    });
    // @ts-expect-error
    server.events.on(["messages.create", "doesn'texist"], (event) => {
      event.type;
    });

    // Subscribe to context changes when the atom is mounted
    onMount(status, () => {
      // Fetch initial status from context
      status.set(server.context.get().status);

      // Subscribe to status changes from the context
      const unsubscribe = server.context.onChange(
        (ctx) => ctx.status,
        (newStatus) => status.set(newStatus),
      );

      // Return cleanup function
      return () => unsubscribe?.();
    });

    return { status };
  });
