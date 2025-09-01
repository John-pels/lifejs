import type z from "zod";
import type { PluginConfig, PluginDefinition } from "@/plugins/server/types";
import type { agentConfig } from "../config";
import type { AgentBuilder } from "./define";

export type ScopeDefinition<Schema extends z.ZodTypeAny = z.ZodTypeAny> = {
  schema: Schema;
  hasAccess: (params: {
    request: Request;
    scope: z.output<Schema>;
  }) => boolean | Promise<boolean>;
};

export type AgentDefinition = {
  name: string;
  config: z.output<typeof agentConfig.serverSchema>;
  plugins: Record<string, PluginDefinition>;
  pluginConfigs: Record<string, unknown>;
  scope?: ScopeDefinition;
};

export type AgentBuilderWithPluginsMethods<
  // biome-ignore lint/suspicious/noExplicitAny: reason
  Builder extends AgentBuilder<any, any>,
  PluginsDefs extends Record<string, PluginDefinition>,
  ExcludedMethods extends string,
> = Builder & {
  [K in keyof PluginsDefs]: K extends string
    ? <const C extends PluginConfig<Extract<PluginsDefs[K], { name: K }>["config"], "input">>(
        config: C,
      ) => Omit<
        AgentBuilderWithPluginsMethods<
          AgentBuilder<
            Builder["_definition"] & {
              pluginConfigs: {
                [Key in K]: PluginConfig<Extract<PluginsDefs[K], { name: K }>["config"], "output"> &
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
