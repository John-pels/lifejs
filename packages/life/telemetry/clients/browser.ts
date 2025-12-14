import { UAParser } from "ua-parser-js";
import { isAIBot, isBot } from "ua-parser-js/helpers";

import z from "zod";
import { clientConfigSchema } from "@/agent/config";
import packageJson from "../../package.json" with { type: "json" };
import type { TelemetryResource, TelemetryScopeAttributes, TelemetrySpan } from "../types";
import { defineScopes, TelemetryClient } from "./base";

const baseAgentClientAttributesSchema = z.object({
  agentName: z.string(),
  agentId: z.string(),
  agentConfig: clientConfigSchema,
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
      `Agent (${attributes?.agentName} - ${attributes?.agentId.replace("agent_", "").slice(0, 6)})`,
  },
  "plugin.client": {
    requiredAttributesSchema: baseAgentClientAttributesSchema.extend({
      pluginName: z.string(),
      pluginClientConfig: z.any(),
    }),
    displayName: (attributes) => `Plugin (${attributes?.pluginName})`,
  },
  react: {
    requiredAttributesSchema: z.object(),
    displayName: "React",
  },
});

export class TelemetryBrowserClient extends TelemetryClient {
  constructor(scope: string) {
    super(telemetryBrowserScopesDefinition, scope);
    this.#attachFlushEventListeners();
  }

  /**
   * Attaches event listeners for best-effort flushing of telemetry data
   * before the page unloads, loses visibility, or gets hibernated.
   */
  #attachFlushEventListeners(): void {
    const flush = () => this.flushConsumers().catch(() => ({}));
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }

  protected getResource(): TelemetryResource {
    const results = new UAParser().getResult();

    // Identify environment
    const parseEnvironment = (_value?: string) => {
      if (!_value) return null;
      const value = _value.trim().toLowerCase();

      // Check known environments
      if (["development", "production", "staging", "test"].includes(value))
        return value as TelemetryResource["environment"];

      // Support common aliases
      const alias = {
        dev: "development",
        prod: "production",
        stage: "staging",
        test: "test",
      }[value];
      if (alias) return alias as TelemetryResource["environment"];

      // Else return null
      return null;
    };
    const environment: TelemetryResource["environment"] =
      parseEnvironment(import.meta.env?.MODE) ??
      parseEnvironment(globalThis.process?.env?.NODE_ENV) ??
      parseEnvironment(globalThis.process?.env?.NEXT_PUBLIC_ENV) ??
      (typeof window !== "undefined" &&
      // biome-ignore lint/performance/useTopLevelRegex: unecessary
      /^(localhost|127(?:\.\d{1,3}){3}|\[?::1\]?)$/.test(globalThis.location?.hostname ?? "")
        ? "development"
        : "production");

    const userAgent = navigator.userAgent.toLowerCase();
    return {
      platform: "browser" as const,
      environment,
      lifeVersion: packageJson.version,
      deviceType: results?.device?.type ?? "unknown",
      deviceBrand: results?.device?.vendor || "unknown",
      deviceModel: results?.device?.model || "unknown",
      osName: results?.os?.name || "unknown",
      osVersion: results?.os?.version || "unknown",
      cpuArchitecture: results?.cpu?.architecture ?? "unknown",
      browserUserAgent: navigator.userAgent,
      browserName: results?.browser?.name || "unknown",
      browserVersion: results?.browser?.version || "unknown",
      browserEngine: results?.engine?.name || "unknown",
      isBot: isBot(userAgent),
      isAiBot: isAIBot(userAgent),
      schemaVersion: "1",
    };
  }

  protected getCurrentSpanData(): TelemetrySpan | undefined {
    // In the browser, there is no AsyncLocalStorage and no truly reliable alternative either
    // so as many Telemetry providers like Sentry did, the browser client haw a flat span
    // hierarchy, i.e., when you create a span, its parent is always the root span.
    // Considering that the Life.js codebase depth is mainly on the server, and that client-side
    // concerns are properly separated (plugins, agents, client, react), scope and proper naming
    // of spans should be enough to make the collected data easy to understand.
    return;
  }

  protected runWithSpanData(_spanData: TelemetrySpan | undefined, fn: () => unknown): unknown {
    return fn();
  }
}

export function createTelemetryClient<Scope extends keyof typeof telemetryBrowserScopesDefinition>(
  scope: Scope,
  requiredAttributes: TelemetryScopeAttributes<
    (typeof telemetryBrowserScopesDefinition)[Scope]["requiredAttributesSchema"]
  >,
) {
  const client = new TelemetryBrowserClient(scope);
  for (const [key, value] of Object.entries(requiredAttributes)) client.setAttribute(key, value);
  return client;
}
