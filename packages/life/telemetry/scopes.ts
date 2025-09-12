import z from "zod";
import { agentClientConfig, agentServerConfig } from "@/agent/config";
import type { TelemetryScopeDefinition } from "./types";

const baseAgentServerAttributesSchema = z.object({
  agentName: z.string(),
  agentId: z.string(),
  agentSha: z.string(),
  agentConfig: agentServerConfig.schemaTelemetry,
  transportProviderName: z.string(),
  llmProviderName: z.string(),
  sttProviderName: z.string(),
  eouProviderName: z.string(),
  ttsProviderName: z.string(),
  vadProviderName: z.string(),
});

const baseAgentClientAttributesSchema = z.object({
  agentName: z.string(),
  agentId: z.string(),
  agentSha: z.string(),
  agentConfig: agentClientConfig.schemaTelemetry,
  transportProviderName: z.string(),
});

function defineScopes<const Schemas extends Record<string, z.AnyZodObject>>(
  scopes: {
    [K in keyof Schemas]: TelemetryScopeDefinition<Schemas[K]>;
  },
) {
  return scopes;
}

/**
 * The list of valid telemetry scopes in the Life.js codebase.
 * Ensure consistency and typesafety.
 */
export const telemetryScopesDefinitions = defineScopes({
  compiler: {
    displayName: "Compiler",
    requiredAttributesSchema: z.object({
      watch: z.boolean(),
      optimize: z.boolean(),
    }),
  },
  cli: {
    displayName: "CLI",
    requiredAttributesSchema: z.object({
      command: z.string(), // e.g. "dev", "build", "start", "init"
      args: z.array(z.string()),
    }),
  },
  server: {
    displayName: "Server",
    requiredAttributesSchema: z.object({
      watch: z.boolean(),
    }),
  },
  "agent.server": {
    requiredAttributesSchema: baseAgentServerAttributesSchema,
    displayName: (attributes) =>
      `Server > Agent (${attributes?.agentName} - ${attributes?.agentId?.slice(0, 8)})`,
  },
  "plugin.server": {
    requiredAttributesSchema: baseAgentServerAttributesSchema.extend({
      pluginName: z.string(),
      pluginServerConfig: z.any(),
    }),
    displayName: (attributes) => `Server > Plugin (${attributes?.pluginName})`,
  },
  client: {
    requiredAttributesSchema: z.object({}),
    displayName: "Client",
  },
  "agent.client": {
    requiredAttributesSchema: baseAgentClientAttributesSchema,
    displayName: (attributes) =>
      `Client > Agent (${attributes?.agentName} - ${attributes?.agentId.slice(0, 8)})`,
  },
  "plugin.client": {
    requiredAttributesSchema: baseAgentClientAttributesSchema.extend({
      pluginName: z.string(),
      pluginClientConfig: z.any(),
    }),
    displayName: (attributes) => `Client > Plugin (${attributes?.pluginName})`,
  },
  react: {
    requiredAttributesSchema: z.object({}),
    displayName: "React",
  },
});

export type TelemetryScope = keyof typeof telemetryScopesDefinitions;
