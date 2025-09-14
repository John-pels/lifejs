import { AsyncLocalStorage } from "node:async_hooks";
import os from "node:os";
import type z from "zod";
import packageJson from "../../package.json" with { type: "json" };
import { AnonymousDataConsumer } from "../consumers/anonymous";
import { telemetryNodeScopesDefinition } from "../scopes/node";
import type { TelemetryResource, TelemetrySpan } from "../types";
import { TelemetryClient } from "./base";

export class TelemetryNodeClient extends TelemetryClient {
  readonly #spanDataContext = new AsyncLocalStorage<TelemetrySpan | undefined>();

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

  protected enterContextWith(spanData: TelemetrySpan | undefined) {
    this.#spanDataContext.enterWith(spanData);
  }

  protected runWithSpanData(spanData: TelemetrySpan | undefined, fn: () => unknown) {
    return this.#spanDataContext.run(spanData, fn);
  }
}

export function createTelemetryClient<Scope extends keyof typeof telemetryNodeScopesDefinition>(
  scope: Scope,
  requiredAttributes: z.infer<
    (typeof telemetryNodeScopesDefinition)[Scope]["requiredAttributesSchema"]
  >,
) {
  // Validate the required attributes
  const schema = telemetryNodeScopesDefinition[scope].requiredAttributesSchema;
  const { data, error } = schema.safeParse(requiredAttributes);
  if (error) throw new Error(`Invalid required attributes for scope '${scope}': ${error.message}`);

  // Ensure requested scope is valid
  if (!Object.keys(telemetryNodeScopesDefinition).includes(scope))
    throw new Error(`Invalid telemetry scope: '${scope}'.`);

  // Build the client
  const client = new TelemetryNodeClient(scope);
  for (const [key, value] of Object.entries(data)) client.setAttribute(key, value);
  return client;
}

// Register the anonymous data consumer if the project has not opted out
if (!process.env.LIFE_TELEMETRY_DISABLED) {
  TelemetryNodeClient.registerGlobalConsumer(new AnonymousDataConsumer());
}
