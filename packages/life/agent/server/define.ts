import { z } from "zod";
import type { agentServerConfig } from "@/agent/server/config";
import type {
  PluginConfig,
  PluginDefinition,
  PluginDependenciesDefinition,
  PluginDependencyDefinition,
} from "@/plugins/server/types";
import type {
  AgentBuilderWithPluginsMethods,
  AgentDefinition,
  AgentScopeDefinition,
} from "./types";

export class AgentBuilder<
  const Definition extends AgentDefinition,
  ExcludedMethods extends string = never,
> {
  _definition: Definition;

  constructor(definition: Definition) {
    this._definition = definition;
  }

  config(config: z.input<typeof agentServerConfig.schema>) {
    // Create a new builder instance with the provided config
    const builder = new AgentBuilder({
      ...this._definition,
      config,
    }) as AgentBuilder<Definition, ExcludedMethods | "config">;

    // Return the new builder with the plugins methods, minus excluded methods
    return this.#withPluginsMethods(builder, this._definition.plugins) as Omit<
      AgentBuilderWithPluginsMethods<
        typeof builder,
        Definition["plugins"],
        ExcludedMethods | "config"
      >,
      ExcludedMethods | "config"
    >;
  }

  scope<Schema extends z.ZodObject>(scopeDef: AgentScopeDefinition<Schema>) {
    // Create a new builder instance with the provided scope
    const builder = new AgentBuilder({
      ...this._definition,
      scope: scopeDef,
    }) as AgentBuilder<
      Definition & { scope: AgentScopeDefinition<Schema> },
      ExcludedMethods | "scope"
    >;

    // Return the new builder with the plugins methods, minus excluded methods
    return this.#withPluginsMethods(builder, this._definition.plugins) as Omit<
      AgentBuilderWithPluginsMethods<
        typeof builder,
        Definition["plugins"],
        ExcludedMethods | "scope"
      >,
      ExcludedMethods | "scope"
    >;
  }

  plugins<const Plugins extends readonly { _definition: PluginDefinition }[]>(plugins: Plugins) {
    // Convert array of plugin builders to dependencies definition
    const defs: PluginDependenciesDefinition = {};
    for (const plugin of plugins) defs[plugin._definition.name] = plugin._definition;

    // Type to extract dependency definition from array of plugins
    type ExtractedDefs = {
      [K in Plugins[number] as K["_definition"]["name"]]: K["_definition"];
    };
    type ExtractedConfigs = {
      [K in Plugins[number] as K["_definition"]["name"]]: PluginConfig<
        K["_definition"]["config"],
        "output"
      >;
    };

    // Create a new builder instance with the provided plugins
    const builder = new AgentBuilder({
      ...this._definition,
      plugins: defs,
    }) as unknown as AgentBuilder<
      Definition & { plugins: ExtractedDefs; pluginConfigs: ExtractedConfigs },
      ExcludedMethods | "plugins"
    >;

    // Return the new builder with the plugins methods, minus excluded methods
    return this.#withPluginsMethods(builder, defs) as Omit<
      AgentBuilderWithPluginsMethods<typeof builder, ExtractedDefs, ExcludedMethods | "plugins">,
      ExcludedMethods | "plugins"
    >;
  }

  // biome-ignore lint/suspicious/noExplicitAny: reason
  #withPluginsMethods<Builder extends AgentBuilder<any, any>>(
    builder: Builder,
    plugins: PluginDependenciesDefinition,
  ) {
    for (const plugin of Object.values(plugins)) {
      Object.assign(builder, {
        [plugin.name]: builder.#pluginMethod(plugin, plugins),
      });
    }
    return builder;
  }

  #pluginMethod(plugin: PluginDependencyDefinition, plugins: PluginDependenciesDefinition) {
    return <const C extends z.input<PluginDefinition["config"]["schema"]>>(config: C): unknown => {
      const builder = new AgentBuilder({
        ...this._definition,
        pluginConfigs: {
          ...(this._definition.pluginConfigs ?? {}),
          [plugin.name]: config,
        },
      });
      return this.#withPluginsMethods(builder, plugins) as Omit<
        AgentBuilderWithPluginsMethods<typeof builder, Definition["plugins"], ExcludedMethods>,
        ExcludedMethods
      >;
    };
  }
}

export function defineAgent<const Name extends string>(name: Name) {
  return new AgentBuilder({
    name,
    config: {},
    plugins: {},
    pluginConfigs: {},
    scope: { schema: z.object(), hasAccess: () => true },
  });
}
