import { z } from "zod";
import { createConfig } from "@/shared/config";
import { LivekitEOU, livekitEOUConfig } from "./providers/livekit";
import { TurnSenseEOU, turnSenseEOUConfig } from "./providers/turnsense";

// Providers
export const eouProviders = {
  turnsense: { class: TurnSenseEOU, configSchema: turnSenseEOUConfig.serverSchema },
  livekit: { class: LivekitEOU, configSchema: livekitEOUConfig.serverSchema },
} as const;

export type EOUProvider = (typeof eouProviders)[keyof typeof eouProviders]["class"];

// Config
export const eouProviderConfig = createConfig({
  serverSchema: z.discriminatedUnion("provider", [
    livekitEOUConfig.serverSchema,
    turnSenseEOUConfig.serverSchema,
  ]),
  clientSchema: z.object({}),
});
