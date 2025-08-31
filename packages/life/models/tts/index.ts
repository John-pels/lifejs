import { z } from "zod";
import { createConfig } from "@/shared/config";
import { CartesiaTTS, cartesiaTTSConfig } from "./providers/cartesia";

// Providers
export const ttsProviders = {
  cartesia: { class: CartesiaTTS, configSchema: cartesiaTTSConfig.serverSchema },
} as const;

export type TTSProvider = (typeof ttsProviders)[keyof typeof ttsProviders]["class"];

// Config
export const ttsProviderConfig = createConfig({
  serverSchema: z.discriminatedUnion("provider", [cartesiaTTSConfig.serverSchema]),
  clientSchema: z.object({}),
});
