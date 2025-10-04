import { z } from "zod";
import { eouProviderConfig } from "@/models/eou";
import { llmProviderConfig } from "@/models/llm";
import { sttProviderConfig } from "@/models/stt";
import { ttsProviderConfig } from "@/models/tts";
import { vadProviderConfig } from "@/models/vad";
import { createConfig } from "@/shared/config";
import { deepClone } from "@/shared/deep-clone";
import { deepMerge } from "@/shared/deep-merge";
import * as op from "@/shared/operation";
import type { TelemetryConsumer } from "@/telemetry/types";
import { transportNodeConfig } from "@/transport/config/node";
import { agentClientConfig } from "../client/config";

export const agentServerConfig = createConfig({
  schema: z.object({
    transport: transportNodeConfig.schema.prefault({ provider: "livekit" }),
    models: z
      .object({
        vad: vadProviderConfig.schema.prefault({ provider: "silero" }),
        stt: sttProviderConfig.schema.prefault({ provider: "deepgram" }),
        eou: eouProviderConfig.schema.prefault({ provider: "livekit" }),
        llm: llmProviderConfig.schema.prefault({ provider: "openai" }),
        tts: ttsProviderConfig.schema.prefault({ provider: "cartesia" }),
      })
      .prefault({}),
    telemetry: z
      .object({
        consumers: z.array(z.custom<TelemetryConsumer>()).prefault([]),
      })
      .prefault({}),
    experimental: z.object().prefault({}),
  }),
  toTelemetryAttribute: (config) => {
    // Remember if there are custom telemetry consumers
    config.telemetry.hasCustomConsumers = Boolean(config.telemetry.consumers.length);

    // Redact telemetry consumers (non-serializable)
    config.telemetry.consumers = "redacted" as never;

    return config;
  },
});

/**
 * Used to define a global config in a `life.config.ts` file.
 * @param def - The config definition.
 * @returns The validated config.
 */
export function defineConfig(config: z.input<typeof agentServerConfig.schema>) {
  return config;
}

export function prepareAgentConfig(
  agentConfig: z.input<typeof agentServerConfig.schema>,
  globalConfigs: z.input<typeof agentServerConfig.schema>[],
) {
  // Obtain and validate the final config object
  const orderedGlobalConfigs = deepClone(globalConfigs).reverse();
  const mergedConfig = deepMerge(...orderedGlobalConfigs, agentConfig);
  const { error, data: parsedConfig } = agentServerConfig.schema.safeParse(mergedConfig);
  if (error) {
    return op.failure({
      code: "Validation",
      message: "Invalid agent config.",
      cause: error,
    });
  }

  // Produce the client-side subset config
  const clientConfig = agentClientConfig.schema.parse(parsedConfig);

  return op.success({ server: parsedConfig, client: clientConfig });
}
