import {
  createClient,
  type DeepgramClient,
  type ListenLiveClient,
  type LiveTranscriptionEvent,
  LiveTranscriptionEvents,
} from "@deepgram/sdk";
import { z } from "zod";
import { createConfig } from "@/shared/config";
import { STTBase, type STTGenerateJob } from "../base";

// Config
export const deepgramSTTConfig = createConfig({
  schema: z.object({
    provider: z.literal("deepgram"),
    apiKey: z.string().default(process.env.DEEPGRAM_API_KEY ?? ""),
    model: z
      .enum([
        "nova-3",
        "nova-2",
        "nova-2-general",
        "nova-2-meeting",
        "nova-2-phonecall",
        "nova-2-voicemail",
        "nova-2-finance",
        "nova-2-conversationalai",
        "nova-2-video",
        "nova-2-medical",
        "nova-2-drivethru",
        "nova-2-automotive",
        "nova-2-atc",
        "nova",
        "nova-general",
        "nova-phonecall",
        "enhanced",
        "enhanced-general",
        "enhanced-meeting",
        "enhanced-phonecall",
        "enhanced-finance",
        "base",
        "base-general",
        "base-meeting",
        "base-phonecall",
        "base-voicemail",
        "base-finance",
        "base-conversationalai",
        "base-video",
        "whisper-tiny",
        "whisper-base",
        "whisper-small",
        "whisper-medium",
        "whisper-large",
      ])
      .default("nova-2-general"),
    language: z.string().default("en"),
  }),
  toTelemetryAttribute: (config) => {
    // Redact sensitive fields
    config.apiKey = "redacted" as never;

    return config;
  },
});

// Model
export class DeepgramSTT extends STTBase<typeof deepgramSTTConfig.schema> {
  readonly #deepgram: DeepgramClient;
  readonly #jobsSockets: Map<string, ListenLiveClient> = new Map();

  constructor(config: z.input<typeof deepgramSTTConfig.schema>) {
    super(deepgramSTTConfig.schema, config);
    if (!config.apiKey)
      throw new Error(
        "DEEPGRAM_API_KEY environment variable or config.apiKey must be provided to use this model.",
      );
    this.#deepgram = createClient(config.apiKey);
  }

  // biome-ignore lint/suspicious/useAwait: need async to match STTBase abstract method
  async generate(): Promise<STTGenerateJob> {
    // Create a new generation job
    const job = this.createGenerateJob();

    // Establish a new socket for the job
    const socket = this.#deepgram.listen.live({
      encoding: "linear16",
      sample_rate: 16_000,
      channels: 1,
      filler_words: true,
      numerals: true,
      punctuate: true,
      smart_format: true,
      endpointing: 0, // VAD is managed by the generation plugin
      no_delay: true,

      // Dynamic config
      model: this.config.model,
      language: this.config.language,
    });
    this.#jobsSockets.set(job.id, socket);

    // Push voice chunks as they arrive
    socket.on(LiveTranscriptionEvents.Transcript, (msg: LiveTranscriptionEvent) => {
      const text = msg.channel.alternatives[0]?.transcript;
      if (text) job.raw.receiveChunk({ type: "content", textChunk: text });
    });

    // Handle job cancellation
    job.raw.abortController.signal.addEventListener("abort", () => {
      socket.requestClose();
      this.#jobsSockets.delete(job.id);
    });

    // Ensure the socket is kept alive until the job is cancelled
    setInterval(() => socket.keepAlive(), 1000);

    return job;
  }

  // biome-ignore lint/suspicious/useAwait: Need async to match STTBase abstract method
  protected async _onGeneratePushVoice(job: STTGenerateJob, pcm: Int16Array) {
    this.#jobsSockets.get(job.id)?.send(pcm.buffer);
  }
}
