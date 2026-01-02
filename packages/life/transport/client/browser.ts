import type { z } from "zod";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { transportConfigSchema } from "../config";
import { LiveKitBrowser } from "../providers/livekit/browser";
import { TransportClientBase } from "./base";

// Providers
export const clientTransportProviders = {
  livekit: LiveKitBrowser,
} as const;

// Transport
export class TransportBrowserClient extends TransportClientBase {
  constructor({
    config,
    obfuscateErrors = false,
    telemetry = null,
  }: {
    config: z.output<typeof transportConfigSchema>;
    obfuscateErrors?: boolean;
    telemetry?: TelemetryClient | null;
  }) {
    const ProviderClass = clientTransportProviders[config.provider];
    super({ provider: new ProviderClass(config), obfuscateErrors, telemetry });
  }
}
