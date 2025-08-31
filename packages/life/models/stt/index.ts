import { z } from "zod";
import { createConfig } from "@/shared/config";
import { DeepgramSTT, deepgramSTTConfig } from "./providers/deepgram";

// Providers
export const sttProviders = {
  deepgram: { class: DeepgramSTT, configSchema: deepgramSTTConfig.serverSchema },
} as const;

export type STTProvider = (typeof sttProviders)[keyof typeof sttProviders]["class"];

// Config
export const sttProviderConfig = createConfig({
  serverSchema: z.discriminatedUnion("provider", [deepgramSTTConfig.serverSchema]),
  clientSchema: z.object({}),
});
