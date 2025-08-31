import { z } from "zod";
import { createConfig } from "@/shared/config";
import { SileroVAD, sileroVADConfig } from "./providers/silero";

// Providers
export const vadProviders = {
  silero: { class: SileroVAD, configSchema: sileroVADConfig.serverSchema },
} as const;

export type VADProvider = (typeof vadProviders)[keyof typeof vadProviders]["class"];

// Config
export const vadProviderConfig = createConfig({
  serverSchema: z.discriminatedUnion("provider", [sileroVADConfig.serverSchema]),
  clientSchema: z.object({}),
});
