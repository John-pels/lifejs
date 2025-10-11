import type { z } from "zod";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { TransportClientBase } from "../base";
import type { transportBrowserConfig } from "../config/browser";
import { LiveKitBrowserClient } from "../providers/livekit/browser";

// Providers
export const clientTransportProviders = {
  livekit: LiveKitBrowserClient,
} as const;

// Transport
export class TransportBrowserClient extends TransportClientBase {
  constructor({
    config,
    obfuscateErrors = false,
    telemetry = null,
  }: {
    config: z.output<typeof transportBrowserConfig.schema>;
    obfuscateErrors?: boolean;
    telemetry?: TelemetryClient | null;
  }) {
    const ProviderClass = clientTransportProviders[config.provider];
    super({ provider: new ProviderClass(config), obfuscateErrors, telemetry });
  }
}
