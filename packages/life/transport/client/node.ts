import { ensureServer } from "@/shared/ensure-server";

ensureServer("transport.client.node");

import type { z } from "zod";
import { TransportClientBase } from "../base";
import type { transportNodeConfig } from "../config/node";
import { LiveKitNodeClient } from "../providers/livekit/node";

// Providers
export const nodeTransportProviders = {
  livekit: LiveKitNodeClient,
} as const;

// Transport
export class TransportNodeClient extends TransportClientBase {
  constructor({
    config,
    filterPublic = false,
  }: { config: z.output<(typeof transportNodeConfig)["schema"]>; filterPublic?: boolean }) {
    const ProviderClass = nodeTransportProviders[config.provider];
    super({ provider: new ProviderClass(config), filterPublic });
  }
}
