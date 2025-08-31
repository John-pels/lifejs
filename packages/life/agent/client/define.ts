import type z from "zod";
import type {
  PluginClientConfig,
  PluginClientDefinition,
  PluginClientDependenciesDefinition,
  PluginClientDependencyDefinition,
} from "@/plugins/client/types";
import { type agentConfig, defineConfig } from "../config";
import type { AgentDefinition } from "../server/types";
import type { AgentClientBuilderWithPluginsMethods, AgentClientDefinition } from "./types";

// Agent client builder
export class AgentClientBuilder<
  const ServerDefinition extends AgentDefinition,
  const Definition extends AgentClientDefinition,
  ExcludedMethods extends string = never,
> {
  _definition: Definition;

  constructor(def: Definition) {
    this._definition = def;
  }

  config(params: z.input<typeof agentConfig.clientSchema>) {
    // Create a new builder instance with the provided config
    const builder = new AgentClientBuilder({
      ...this._definition,
      config: defineConfig(params).withDefaults,
    }) as AgentClientBuilder<ServerDefinition, Definition, ExcludedMethods | "config">;

    // Return the new builder with the plugins methods, minus excluded methods
    return this.#withPluginsMethods(builder, this._definition.plugins) as Omit<
      AgentClientBuilderWithPluginsMethods<
        typeof builder,
        Definition["plugins"],
        ExcludedMethods | "config"
      >,
      ExcludedMethods | "config"
    >;
  }

  plugins<const Plugins extends readonly { _definition: PluginClientDefinition }[]>(
    plugins: Plugins,
  ) {
    const defs: PluginClientDependenciesDefinition = {};
    for (const plugin of plugins) defs[plugin._definition.name] = plugin._definition;

    type ExtractedPlugins = {
      [K in Plugins[number] as K["_definition"]["name"]]: K["_definition"];
    };
    type ExtractedPluginsConfigs = {
      [K in Plugins[number] as K["_definition"]["name"]]: PluginClientConfig<
        K["_definition"]["config"],
        "output"
      >;
    };

    const builder = new AgentClientBuilder({
      ...this._definition,
      plugins: defs,
    }) as AgentClientBuilder<
      ServerDefinition,
      Definition & { plugins: ExtractedPlugins; pluginConfigs: ExtractedPluginsConfigs },
      ExcludedMethods | "plugins"
    >;

    return this.#withPluginsMethods(builder, defs) as Omit<
      AgentClientBuilderWithPluginsMethods<
        typeof builder,
        ExtractedPlugins,
        ExcludedMethods | "plugins"
      >,
      ExcludedMethods | "plugins"
    >;
  }

  // biome-ignore lint/suspicious/noExplicitAny: reason
  #withPluginsMethods<Builder extends AgentClientBuilder<any, any>>(
    builder: Builder,
    plugins: PluginClientDependenciesDefinition,
  ) {
    for (const plugin of Object.values(plugins)) {
      Object.assign(builder, {
        [plugin.name]: this.#pluginMethod(plugin, plugins),
      });
    }
    return builder;
  }

  #pluginMethod(
    plugin: PluginClientDependencyDefinition,
    plugins: PluginClientDependenciesDefinition,
  ) {
    return <const C extends z.input<PluginClientDefinition["config"]>>(config: C): unknown => {
      const builder = new AgentClientBuilder({
        ...this._definition,
        pluginConfigs: {
          ...((this._definition as Definition).pluginConfigs ?? {}),
          [plugin.name]: plugin.config.parse(config),
        },
      });
      return this.#withPluginsMethods(builder, plugins) as Omit<
        AgentClientBuilderWithPluginsMethods<
          typeof builder,
          Definition["plugins"],
          ExcludedMethods
        >,
        ExcludedMethods
      >;
    };
  }
}

// Helper function to define a agent client
export function defineAgentClient<const ServerAgent extends { _definition: AgentDefinition }>(
  name: ServerAgent["_definition"]["name"],
) {
  const defaultDefinition = {
    name,
    config: defineConfig({}).withDefaults,
    plugins: {},
    pluginConfigs: {},
    $serverDef: {} as ServerAgent["_definition"],
  } as const satisfies AgentClientDefinition;
  return new AgentClientBuilder<ServerAgent["_definition"], typeof defaultDefinition>(
    defaultDefinition,
  );
}
