import { z } from "zod";
import type { PluginDefinition } from "../server/types";
import { PluginClientBase } from "./class";
import type {
  PluginClientAtomsDefinition,
  PluginClientClassDefinitionInput,
  PluginClientConfigDefinition,
  PluginClientDefinition,
  PluginClientDependenciesDefinition,
} from "./types";

export class PluginClientBuilder<
  const ServerDefinition extends PluginDefinition,
  const ClientDefinition extends PluginClientDefinition,
  ExcludedMethods extends string = never,
> {
  _definition: ClientDefinition;

  constructor(def: ClientDefinition) {
    this._definition = def;
  }

  dependencies<const Plugins extends { _definition: PluginClientDefinition }[]>(plugins: Plugins) {
    const dependencies: PluginClientDependenciesDefinition = {};
    for (const plugin of plugins) dependencies[plugin._definition.name] = plugin._definition;

    type ExtractedDependencies = {
      [K in Plugins[number] as K["_definition"]["name"]]: K["_definition"];
    };

    const builder = new PluginClientBuilder({
      ...this._definition,
      dependencies,
    }) as unknown as PluginClientBuilder<
      ServerDefinition,
      ClientDefinition & { dependencies: ExtractedDependencies },
      ExcludedMethods | "dependencies"
    >;
    return builder as Omit<typeof builder, ExcludedMethods | "dependencies">;
  }

  config<const Schema extends PluginClientConfigDefinition>(schema: Schema) {
    const builder = new PluginClientBuilder({
      ...this._definition,
      config: schema,
    }) as PluginClientBuilder<
      ServerDefinition,
      ClientDefinition & { config: Schema },
      ExcludedMethods | "config"
    >;
    return builder as Omit<typeof builder, ExcludedMethods | "config">;
  }

  class<
    const Input extends PluginClientClassDefinitionInput<
      ServerDefinition,
      ClientDefinition,
      z.output<ServerDefinition["config"]>,
      z.output<ClientDefinition["config"]>
    >,
  >(input: Input) {
    const builder = new PluginClientBuilder({
      ...this._definition,
      // biome-ignore lint/suspicious/noExplicitAny: return type is inferred from Input anyway
      class: input({} as any, PluginClientBase),
    }) as unknown as PluginClientBuilder<
      ServerDefinition,
      Omit<ClientDefinition, "class"> & { class: ReturnType<Input> },
      ExcludedMethods | "class"
    >;

    return builder as Omit<typeof builder, ExcludedMethods | "class">;
  }

  atoms<const Atoms extends PluginClientAtomsDefinition<ClientDefinition>>(definition: Atoms) {
    const builder = new PluginClientBuilder({
      ...this._definition,
      atoms: definition,
    }) as PluginClientBuilder<
      ServerDefinition,
      ClientDefinition & { atoms: Atoms },
      ExcludedMethods | "atoms"
    >;
    return builder as Omit<typeof builder, ExcludedMethods | "atoms">;
  }
}

// Helper function to define a plugin client
export function definePluginClient<const ServerPlugin extends { _definition: PluginDefinition }>(
  name: ServerPlugin["_definition"]["name"],
) {
  const defaultDefinition = {
    name,
    atoms: () => ({}),
    class: (
      (_, Base) =>
      <_ServerConfig, _ClientConfig>() =>
        class Client extends Base<PluginClientDefinition> {}
    )({}, PluginClientBase),
    config: z.object({}),
    dependencies: {},
    $serverDef: {} as ServerPlugin["_definition"],
  } as const satisfies PluginClientDefinition;
  return new PluginClientBuilder<ServerPlugin["_definition"], typeof defaultDefinition>(
    defaultDefinition,
  );
}
