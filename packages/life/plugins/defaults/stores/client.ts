import { definePluginClient } from "../../client/define";
import type { storesPlugin } from "./server";

// Required to not exceed the maximum length the TS compiler will serialize.
// Destructuring the definition leads to simpler values types.
type SimplifiedStoresPlugin = {
  _definition: {
    name: typeof storesPlugin._definition.name;
    config: typeof storesPlugin._definition.config;
    context: typeof storesPlugin._definition.context;
    events: typeof storesPlugin._definition.events;
    methods: typeof storesPlugin._definition.methods;
    dependencies: typeof storesPlugin._definition.dependencies;
    lifecycle: typeof storesPlugin._definition.lifecycle;
    effects: typeof storesPlugin._definition.effects;
    services: typeof storesPlugin._definition.services;
    interceptors: typeof storesPlugin._definition.interceptors;
  };
};

export const storesPluginClient = definePluginClient<SimplifiedStoresPlugin>("stores");
