import type { z } from "zod";
import type { transportBrowserConfig } from "../config/browser";
import { LiveKitBrowserClient } from "../providers/livekit/browser";
import { TransportClientBase } from "./base";

// Providers
export const clientTransportProviders = {
  livekit: LiveKitBrowserClient,
} as const;

// Transport
export class TransportBrowserClient extends TransportClientBase {
  constructor(config: z.output<typeof transportBrowserConfig.schema>) {
    const ProviderClass = clientTransportProviders[config.provider];
    super(new ProviderClass(config));
  }
}
