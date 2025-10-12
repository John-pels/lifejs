import z from "zod";
import { agentServerConfig } from "@/agent/server/config";
import { defineScopes } from "./define";

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

/**
 * The list of valid telemetry scopes in the Node.js part of the Life.js codebase.
 * Ensure consistency and typesafety.
 */
export const telemetryNodeScopesDefinition = defineScopes({
  compiler: {
    displayName: "Compiler",
    requiredAttributesSchema: z.object({
      watch: z.boolean(),
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
  webrtc: {
    displayName: "WebRTC",
    requiredAttributesSchema: z.object(),
  },
  "agent.process": {
    displayName: (attributes) =>
      `Agent Process (${attributes?.agentId?.replace("agent_", "").slice(0, 6)})`,
    requiredAttributesSchema: z.object({
      agentId: z.string(),
    }),
  },
  "agent.server": {
    displayName: (attributes) =>
      `Agent (${attributes?.agentName} - ${attributes?.agentId?.replace("agent_", "").slice(0, 6)})`,
    requiredAttributesSchema: baseAgentServerAttributesSchema,
  },
  "plugin.server": {
    displayName: (attributes) => `Plugin (${attributes?.pluginName})`,
    requiredAttributesSchema: baseAgentServerAttributesSchema.extend({
      pluginName: z.string(),
      pluginServerConfig: z.any(),
    }),
  },
});
