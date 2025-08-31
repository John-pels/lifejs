import type clients from "life/exports/build-client";
import type z from "zod";
import type { PluginClientBase } from "@/plugins/client/class";
import type {
  PluginClientClassDefinition,
  PluginClientConfig,
  PluginClientDefinition,
} from "@/plugins/client/types";
import type { agentConfig } from "../config";
import type { AgentDefinition } from "../server/types";
import type { AgentClient } from "./class";
import type { AgentClientBuilder } from "./define";

export type AgentClientDefinition = {
  name: string;
  config: z.output<typeof agentConfig.clientSchema>;
  plugins: Record<string, PluginClientDefinition>;
  pluginConfigs: Record<string, unknown>;
  $serverDef: AgentDefinition;
};

export type AgentClientBuilderWithPluginsMethods<
  // biome-ignore lint/suspicious/noExplicitAny: reason
  Builder extends AgentClientBuilder<any, any>,
  PluginsDefs extends Record<string, PluginClientDefinition>,
  ExcludedMethods extends string,
> = Builder & {
  [K in keyof PluginsDefs]: K extends string
    ? <const C extends PluginClientConfig<Extract<PluginsDefs[K], { name: K }>["config"], "input">>(
        config: C,
      ) => Omit<
        AgentClientBuilderWithPluginsMethods<
          AgentClientBuilder<
            Builder["_definition"]["$serverDef"],
            Builder["_definition"] & {
              pluginConfigs: {
                [Key in K]: PluginClientConfig<
                  Extract<PluginsDefs[K], { name: K }>["config"],
                  "output"
                > &
                  C;
              };
            },
            ExcludedMethods | K
          >,
          PluginsDefs,
          ExcludedMethods | K
        >,
        ExcludedMethods | K
      >
    : never;
};

export type AgentClientPluginsMapping = Record<
  string,
  { class: ReturnType<PluginClientClassDefinition>; definition: PluginClientDefinition }
>;

// Used in plugin-specific client libraries to expect an agent with specific plugins registered as argument
export type AgentClientWithPlugins<
  Client extends AgentClient<AgentClientDefinition>,
  Plugins extends Record<
    string,
    { definition: PluginClientDefinition; class?: ReturnType<PluginClientClassDefinition> }
  >,
> = Client & {
  [K in keyof Plugins]: Omit<
    PluginClientBase<Plugins[K]["definition"]> &
      (Plugins[K]["class"] extends undefined
        ? never
        : Omit<InstanceType<Plugins[K]["class"]>, "methods">),
    "agent" | "telemetry" | "dependencies"
  >;
};

export type GeneratedAgentClient<Name extends keyof typeof clients> = AgentClientWithPlugins<
  AgentClient<(typeof clients)[Name]["definition"]>,
  (typeof clients)[Name]["plugins"]
>;
