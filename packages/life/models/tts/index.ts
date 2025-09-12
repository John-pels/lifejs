import { createConfigUnion } from "@/shared/config";
import { CartesiaTTS, cartesiaTTSConfig } from "./providers/cartesia";

// Providers
export const ttsProviders = {
  cartesia: { class: CartesiaTTS, configSchema: cartesiaTTSConfig },
} as const;

export type TTSProvider = (typeof ttsProviders)[keyof typeof ttsProviders]["class"];

// Config
export const ttsProviderConfig = createConfigUnion("provider", [cartesiaTTSConfig]);
