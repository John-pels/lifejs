import { AsyncLocalStorage } from "node:async_hooks";
import os from "node:os";
import type z from "zod";
import packageJson from "../package.json" with { type: "json" };
import { createTelemetryClientBase, TelemetryClient } from "./base";
import { AnonymousDataConsumer } from "./consumers/anonymous";
import type { telemetryScopesDefinitions } from "./scopes";
import type { TelemetryResource, TelemetrySpan } from "./types";

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

  protected runContextWith(spanData: TelemetrySpan | undefined, fn: () => unknown) {
    return this.#spanDataContext.run(spanData, fn);
  }
}

export function createTelemetryClient<Scope extends keyof typeof telemetryScopesDefinitions>(
  scope: Scope,
  requiredAttributes: z.infer<
    (typeof telemetryScopesDefinitions)[Scope]["requiredAttributesSchema"]
  > = {},
) {
  return createTelemetryClientBase(TelemetryNodeClient, scope, requiredAttributes);
}

// Register the anonymous data consumer if the project has not opted out
if (!process.env.LIFE_TELEMETRY_DISABLED) {
  TelemetryNodeClient.registerGlobalConsumer(new AnonymousDataConsumer());
}
