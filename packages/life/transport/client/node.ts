import { ensureNode } from "@/shared/ensure-node";

ensureNode("TransportNodeClient");

import type { z } from "zod";
import type { TelemetryClient } from "@/telemetry/clients/base";
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
    obfuscateErrors = false,
    telemetry = null,
  }: {
    config: z.output<(typeof transportNodeConfig)["schema"]>;
    obfuscateErrors?: boolean;
    telemetry?: TelemetryClient | null;
  }) {
    const ProviderClass = nodeTransportProviders[config.provider];
    super({ provider: new ProviderClass(config), obfuscateErrors, telemetry });
  }
}
