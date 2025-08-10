import { z } from "zod";
import { DeepgramSTT, deepgramSTTConfigSchema } from "./providers/deepgram";
import { OpenAISTT, openaiSTTConfigSchema } from "./providers/openai";

// Providers
export const sttProviders = {
  deepgram: { class: DeepgramSTT, configSchema: deepgramSTTConfigSchema },
  openai: { class: OpenAISTT, configSchema: openaiSTTConfigSchema },
} as const;

export type STTProvider = (typeof sttProviders)[keyof typeof sttProviders]["class"];

// Config
export type STTProviderConfig<T extends "input" | "output"> = {
  [K in keyof typeof sttProviders]: { provider: K } & (T extends "input"
    ? z.input<(typeof sttProviders)[K]["configSchema"]>
    : z.output<(typeof sttProviders)[K]["configSchema"]>);
}[keyof typeof sttProviders];

export const sttProviderConfigSchema = z.discriminatedUnion(
  "provider",
  Object.entries(sttProviders).map(([key, { configSchema }]) =>
    configSchema.extend({ provider: z.literal(key) }),
  ) as unknown as [
    z.ZodObject<{ provider: z.ZodString }>,
    ...z.ZodObject<{ provider: z.ZodString }>[],
  ],
);
