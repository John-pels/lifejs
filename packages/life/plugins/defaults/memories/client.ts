import { definePluginClient } from "../../client/define";
import type { memoriesPlugin } from "./server";

// Required to not exceed the maximum length the TS compiler will serialize.
// Destructuring the definition leads to simpler values types.
type SimplifiedMemoriesPlugin = {
  _definition: {
    name: typeof memoriesPlugin._definition.name;
    config: typeof memoriesPlugin._definition.config;
    context: typeof memoriesPlugin._definition.context;
    events: typeof memoriesPlugin._definition.events;
    methods: typeof memoriesPlugin._definition.methods;
    dependencies: typeof memoriesPlugin._definition.dependencies;
    lifecycle: typeof memoriesPlugin._definition.lifecycle;
    effects: typeof memoriesPlugin._definition.effects;
    services: typeof memoriesPlugin._definition.services;
    interceptors: typeof memoriesPlugin._definition.interceptors;
  };
};

export const memoriesPluginClient = definePluginClient<SimplifiedMemoriesPlugin>("memories").class(
  (_$Types, Base) =>
    <
      _ServerConfig extends (typeof _$Types)["ServerConfig"],
      _ClientConfig extends (typeof _$Types)["ClientConfig"],
    >() =>
      class extends Base {},
);
