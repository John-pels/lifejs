import { createConfigUnion } from "@/shared/config";
import { LivekitEOU, livekitEOUConfig } from "./providers/livekit";
import { TurnSenseEOU, turnSenseEOUConfig } from "./providers/turnsense";

// Providers
export const eouProviders = {
  turnsense: { class: TurnSenseEOU, configSchema: turnSenseEOUConfig.schema },
  livekit: { class: LivekitEOU, configSchema: livekitEOUConfig.schema },
} as const;

export type EOUProvider = (typeof eouProviders)[keyof typeof eouProviders]["class"];

// Config
export const eouProviderConfig = createConfigUnion("provider", [
  livekitEOUConfig,
  turnSenseEOUConfig,
]);
