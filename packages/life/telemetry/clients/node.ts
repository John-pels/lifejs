import { AsyncLocalStorage } from "node:async_hooks";
import os from "node:os";
import z from "zod";
import packageJson from "../../package.json" with { type: "json" };
import { AnonymousDataConsumer } from "../consumers/anonymous";
import type { TelemetryResource, TelemetryScopeAttributes, TelemetrySpan } from "../types";
import { defineScopes, TelemetryClient } from "./base";

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
      agentName: z.string().optional(),
      agentId: z.string().optional(),
      agentVersion: z.string().optional(),
      transportProviderName: z.string().optional(),
      llmProviderName: z.string().optional(),
      sttProviderName: z.string().optional(),
      eouProviderName: z.string().optional(),
      ttsProviderName: z.string().optional(),
      vadProviderName: z.string().optional(),
    }),
  },
  client: {
    displayName: "Client",
    requiredAttributesSchema: z.object({
      clientName: z.string(),
      clientId: z.string(),
      clientVersion: z.string(),
      clientConfig: z.any(),
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
if (!process.env.LIFE_TELEMETRY_DISABLED) {
  TelemetryNodeClient.registerGlobalConsumer(new AnonymousDataConsumer());
}
