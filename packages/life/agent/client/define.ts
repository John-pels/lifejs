import type z from "zod";
import type {
  PluginClientConfig,
  PluginClientDefinition,
  PluginClientDependenciesDefinition,
} from "@/plugins/client/types";
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

    const builder2 = AgentClientBuilder.#withPluginsMethods(
      builder,
      defs,
    ) as AgentClientBuilderWithPluginsMethods<
      typeof builder,
      ExtractedPlugins,
      ExcludedMethods | "plugins"
    >;

    return builder2 as Omit<typeof builder2, ExcludedMethods | "plugins">;
  }

  // biome-ignore lint/suspicious/noExplicitAny: reason
  static #withPluginsMethods<Builder extends AgentClientBuilder<any, any>>(
    builder: Builder,
    plugins: PluginClientDependenciesDefinition,
  ) {
    for (const plugin of Object.values(plugins)) {
      Object.assign(builder, {
        [plugin.name]: (config: z.input<PluginClientDefinition["config"]["schema"]>): unknown => {
          const newBuilder = new AgentClientBuilder({
            ...builder._definition,
            pluginConfigs: {
              ...(builder._definition.pluginConfigs ?? {}),
              [plugin.name]: plugin.config.schema.parse(config),
            },
          });
          return AgentClientBuilder.#withPluginsMethods(newBuilder, plugins);
        },
      });
    }
    return builder;
  }
}

// Helper function to define a agent client
export function defineAgentClient<const ServerAgent extends { _definition: AgentDefinition }>(
  name: ServerAgent["_definition"]["name"],
) {
  const defaultDefinition = {
    name,
    plugins: {},
    pluginConfigs: {},
    $serverDef: {} as ServerAgent["_definition"],
  } as const satisfies AgentClientDefinition;
  return new AgentClientBuilder<ServerAgent["_definition"], typeof defaultDefinition>(
    defaultDefinition,
  );
}
