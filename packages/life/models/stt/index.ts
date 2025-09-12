import { createConfigUnion } from "@/shared/config";
import { DeepgramSTT, deepgramSTTConfig } from "./providers/deepgram";

// Providers
export const sttProviders = {
  deepgram: { class: DeepgramSTT, configSchema: deepgramSTTConfig },
} as const;

export type STTProvider = (typeof sttProviders)[keyof typeof sttProviders]["class"];

// Config
export const sttProviderConfig = createConfigUnion("provider", [deepgramSTTConfig]);
