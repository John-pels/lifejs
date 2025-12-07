import { AsyncLocalStorage } from "node:async_hooks";
import os from "node:os";
import z from "zod";
import { agentServerConfig } from "@/agent/server/config";
import packageJson from "../../package.json" with { type: "json" };
import type { TelemetryResource, TelemetryScopeAttributes, TelemetrySpan } from "../types";
import { defineScopes, TelemetryClient } from "./base";

const baseAgentServerAttributesSchema = z.object({
  agentName: z.string(),
  agentId: z.string(),
  agentSha: z.string(),
  agentConfig: agentServerConfig.schema.transform((c) => agentServerConfig.toTelemetry(c)),
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

export class TelemetryNodeClient extends TelemetryClient {
  readonly #spanDataContext = new AsyncLocalStorage<TelemetrySpan | undefined>();

  constructor(scope: string) {
    super(telemetryNodeScopesDefinition, scope);
  }

  protected getResource() {
    return {
      platform: "node",
      environment: (process.env.NODE_ENV || "development") as TelemetryResource["environment"],
      isCi: Boolean(process.env.CI),
      nodeVersion: process.version,
      lifeVersion: packageJson.version,
      osName: os.platform(),
      osVersion: os.release(),
      cpuCount: os.cpus().length,
      cpuArchitecture: os.arch(),
      schemaVersion: "1",
    } as const;
  }

  protected getCurrentSpanData() {
    return this.#spanDataContext.getStore();
  }

  protected runWithSpanData(spanData: TelemetrySpan | undefined, fn: () => unknown) {
    return this.#spanDataContext.run(spanData, fn);
  }
}

export function createTelemetryClient<Scope extends keyof typeof telemetryNodeScopesDefinition>(
  scope: Scope,
  requiredAttributes: TelemetryScopeAttributes<
    (typeof telemetryNodeScopesDefinition)[Scope]["requiredAttributesSchema"]
  >,
) {
  const client = new TelemetryNodeClient(scope);
  for (const [key, value] of Object.entries(requiredAttributes)) client.setAttribute(key, value);
  return client;
}

// Register the anonymous data consumer if the project has not opted out
// if (!process.env.LIFE_TELEMETRY_DISABLED) {
//   TelemetryNodeClient.registerGlobalConsumer(new AnonymousDataConsumer());
// }
