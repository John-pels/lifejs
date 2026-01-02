import { ensureNode } from "@/shared/ensure-node";

ensureNode("TransportNodeClient");

import type { z } from "zod";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { transportConfigSchema } from "../config";
import { LiveKitNode } from "../providers/livekit/nodejs";
import { TransportClientBase } from "./base";

// Providers
export const nodeTransportProviders = {
  livekit: LiveKitNode,
} as const;

// Transport
export class TransportNodeClient extends TransportClientBase {
  constructor({
    config,
    obfuscateErrors = false,
    telemetry = null,
  }: {
    config: z.output<typeof transportConfigSchema>;
    obfuscateErrors?: boolean;
    telemetry?: TelemetryClient | null;
  }) {
    const ProviderClass = nodeTransportProviders[config.provider];
    super({ provider: new ProviderClass(config), obfuscateErrors, telemetry });
  }
}
