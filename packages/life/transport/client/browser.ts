import type { z } from "zod";
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
    filterPublic = false,
  }: { config: z.output<typeof transportBrowserConfig.schema>; filterPublic?: boolean }) {
    const ProviderClass = clientTransportProviders[config.provider];
    super({ provider: new ProviderClass(config), filterPublic });
  }
}
