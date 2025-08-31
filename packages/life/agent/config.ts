import { z } from "zod";
import { eouProviderConfig } from "@/models/eou";
import { llmProviderConfig } from "@/models/llm";
import { sttProviderConfig } from "@/models/stt";
import { ttsProviderConfig } from "@/models/tts";
import { vadProviderConfig } from "@/models/vad";
import { createConfig } from "@/shared/config";
import type { TelemetryConsumer } from "@/telemetry/types";
import { transportConfig } from "@/transport/config";

// Main agent config schema using createConfigSchema
export const agentConfig = createConfig({
  serverSchema: z
    .object({
      transport: transportConfig.serverSchema.default({ provider: "livekit" }),
      models: z
        .object({
          vad: vadProviderConfig.serverSchema.default({ provider: "silero" }),
          stt: sttProviderConfig.serverSchema.default({ provider: "deepgram" }),
          eou: eouProviderConfig.serverSchema.default({ provider: "livekit" }),
          llm: llmProviderConfig.serverSchema.default({ provider: "openai" }),
          tts: ttsProviderConfig.serverSchema.default({ provider: "cartesia" }),
        })
        .default({}),
      telemetry: z
        .object({
          consumers: z.array(z.custom<TelemetryConsumer>()).default([]),
        })
        .default({}),
      experimental: z.object({}).default({}),
    })
    .default({}),
  clientSchema: z.object({
    transport: transportConfig.clientSchema.default({ provider: "livekit" }),
    experimental: z.object({}).default({}),
  }),
});

// Define config function for use in life.config.ts files
export function defineConfig(def: z.input<typeof agentConfig.serverSchema>) {
  const parsedConfig = agentConfig.serverSchema.parse(def);
  return { raw: def, withDefaults: parsedConfig };
}
