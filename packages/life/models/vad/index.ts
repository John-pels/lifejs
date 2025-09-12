import { createConfigUnion } from "@/shared/config";
import { SileroVAD, sileroVADConfig } from "./providers/silero";

// Providers
export const vadProviders = {
  silero: { class: SileroVAD, configSchema: sileroVADConfig },
} as const;

export type VADProvider = (typeof vadProviders)[keyof typeof vadProviders]["class"];

// Config
export const vadProviderConfig = createConfigUnion("provider", [sileroVADConfig]);
