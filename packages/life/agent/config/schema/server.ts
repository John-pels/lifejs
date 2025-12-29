import { z } from "zod";
import { eouConfigSchema } from "@/models/eou/config";
import { llmConfigSchema } from "@/models/llm/config";
import { sttConfigSchema } from "@/models/stt/config";
import { ttsConfigSchema } from "@/models/tts/config";
import { vadConfigSchema } from "@/models/vad/config";
import type { TelemetryConsumer } from "@/telemetry/types";
import { transportNodeConfig } from "@/transport/config/node";

export const configSchema = z.object({
  enableVoice: z.boolean().prefault(true),
  enableText: z.boolean().prefault(true),
  transport: transportNodeConfig.schema.prefault({ provider: "livekit" }),
  models: z
    .object({
      llm: llmConfigSchema.prefault({}),
      eou: eouConfigSchema.prefault({ provider: "livekit" }),
      stt: sttConfigSchema.prefault({ provider: "deepgram" }),
      tts: ttsConfigSchema.prefault({ provider: "cartesia" }),
      vad: vadConfigSchema.prefault({ provider: "silero" }),
    })
    .prefault({}),
  telemetry: z
    .object({
      consumers: z.array(z.custom<TelemetryConsumer>()).prefault([]),
    })
    .prefault({}),
  experimental: z.object().prefault({}),
});
