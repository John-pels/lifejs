import { ensureServer } from "@/shared/ensure-server";

ensureServer("transport.server");

import type { z } from "zod";
import type { transportNodeConfig } from "../config/node";
import { LiveKitNodeClient } from "../providers/livekit/node";
import { TransportClientBase } from "./base";

// Providers
export const nodeTransportProviders = {
  livekit: LiveKitNodeClient,
} as const;

// Transport
export class TransportNodeClient extends TransportClientBase {
  constructor(config: z.output<(typeof transportNodeConfig)["schema"]>) {
    const ProviderClass = nodeTransportProviders[config.provider];
    super(new ProviderClass(config));
  }
}
