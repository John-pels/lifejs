import { z } from "zod";
import { eouProviderConfig } from "@/models/eou";
import { llmProviderConfig } from "@/models/llm";
import { sttProviderConfig } from "@/models/stt";
import { ttsProviderConfig } from "@/models/tts";
import { vadProviderConfig } from "@/models/vad";
import { createConfig } from "@/shared/config";
import type { TelemetryConsumer } from "@/telemetry/types";
import { transportBrowserConfig } from "@/transport/config/browser";
import { transportNodeConfig } from "@/transport/config/node";

export const agentServerConfig = createConfig({
  schema: z.object({
    transport: transportNodeConfig.schema.default({ provider: "livekit" }),
    models: z
      .object({
        vad: vadProviderConfig.schema.default({ provider: "silero" }),
        stt: sttProviderConfig.schema.default({ provider: "deepgram" }),
        eou: eouProviderConfig.schema.default({ provider: "livekit" }),
        llm: llmProviderConfig.schema.default({ provider: "openai" }),
        tts: ttsProviderConfig.schema.default({ provider: "cartesia" }),
      })
      .default({}),
    telemetry: z
      .object({
        consumers: z.array(z.custom<TelemetryConsumer>()).default([]),
      })
      .default({}),
    experimental: z.object({}).default({}),
  }),
  toTelemetryAttribute: (config) => {
    // Remember if there are custom telemetry consumers
    config.telemetry.hasCustomConsumers = Boolean(config.telemetry.consumers.length);

    // Redact telemetry consumers (non-serializable)
    config.telemetry.consumers = "redacted" as never;

    return config;
  },
});

export const agentClientConfig = createConfig({
  schema: z.object({
    transport: transportBrowserConfig.schema.default({ provider: "livekit" }),
    experimental: z.object({}).default({}),
  }),
  toTelemetryAttribute: (config) => {
    return config;
  },
});

/**
 * Used to define a global config in a `life.config.ts` file.
 * @param def - The config definition.
 * @returns The validated config.
 */
export function defineConfig(def: z.input<typeof agentServerConfig.schema>) {
  const parsedConfig = agentServerConfig.schema.parse(def);
  return { raw: def, withDefaults: parsedConfig };
}
