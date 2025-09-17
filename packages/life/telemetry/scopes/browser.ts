import z from "zod";
import { agentClientConfig } from "@/agent/client/config";
import { defineScopes } from "./define";

const baseAgentClientAttributesSchema = z.object({
  agentName: z.string(),
  agentId: z.string(),
  agentConfig: agentClientConfig.schemaTelemetry,
  transportProviderName: z.string(),
});

/**
 * The list of valid telemetry scopes in the browser part of the Life.js codebase.
 * Ensure consistency and typesafety.
 */
export const telemetryBrowserScopesDefinition = defineScopes({
  client: {
    requiredAttributesSchema: z.object(),
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
    requiredAttributesSchema: z.object(),
    displayName: "React",
  },
});
