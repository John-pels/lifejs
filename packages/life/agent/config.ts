import { z } from "zod";
// import { eouProviderConfig } from "@/models/eou";
// import { llmProviderConfig } from "@/models/llm";
// import { sttProviderConfig } from "@/models/stt";
// import { ttsProviderConfig } from "@/models/tts";
// import { vadProviderConfig } from "@/models/vad";
import { deepClone } from "@/shared/deep-clone";
import { deepMerge } from "@/shared/deep-merge";
import * as op from "@/shared/operation";
import type { TelemetryConsumer } from "@/telemetry/types";
import { transportBrowserConfig } from "@/transport/config/browser";
import { transportNodeConfig } from "@/transport/config/node";

export const configSchema = z.object({
  transport: transportNodeConfig.schema.prefault({ provider: "livekit" }),
  // models: z
  //   .object({
  //     vad: vadProviderConfig.schema.prefault({ provider: "silero" }),
  //     stt: sttProviderConfig.schema.prefault({ provider: "deepgram" }),
  //     eou: eouProviderConfig.schema.prefault({ provider: "livekit" }),
  //     llm: llmProviderConfig.schema.prefault({ provider: "openai" }),
  //     tts: ttsProviderConfig.schema.prefault({ provider: "cartesia" }),
  //   })
  //   .prefault({}),
  telemetry: z
    .object({
      consumers: z.array(z.custom<TelemetryConsumer>()).prefault([]),
    })
    .prefault({}),
  experimental: z.object().prefault({}),
});

export const clientConfigSchema = z.object({
  transport: transportBrowserConfig.schema.prefault({ provider: "livekit" }),
  experimental: z.object().prefault({}),
});

/**
 * Used to define a global config in a `life.config.ts` file.
 * @param def - The config definition.
 * @returns The validated config.
 */
export function defineConfig(config: z.input<typeof configSchema>) {
  return config;
}

export function prepareAgentConfig(
  agentConfig: z.input<typeof configSchema>,
  globalConfigs: z.input<typeof configSchema>[],
) {
  // Obtain and validate the final config object
  const orderedGlobalConfigs = deepClone(globalConfigs).reverse();
  const mergedConfig = deepMerge(...orderedGlobalConfigs, agentConfig);
  const { error: errorConfig, data: serverConfig } = configSchema.safeParse(mergedConfig);
  if (errorConfig)
    return op.failure({
      code: "Validation",
      message: "Invalid agent server config.",
      cause: errorConfig,
    });

  // Produce the client-side subset config
  const { error: errorClientConfig, data: clientConfig } =
    clientConfigSchema.safeParse(serverConfig);
  if (errorClientConfig)
    return op.failure({
      code: "Validation",
      message: "Invalid agent client config.",
      cause: errorClientConfig,
    });

  return op.success({ server: serverConfig, client: clientConfig });
}
