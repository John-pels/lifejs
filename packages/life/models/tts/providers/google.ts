import { TextToSpeechClient } from "@google-cloud/text-to-speech";
import { z } from "zod";
import * as op from "@/shared/operation";
import { TTSProviderBase } from "../base";
import type { TTSJob } from "../types";

// Config
export const googleTTSConfig = z.object({
  provider: z.literal("google"),
  apiKey: z.string().optional(), // Google usually uses keyFile or default credentials
  keyFilename: z.string().optional(),
  language: z.string().prefault("en-US"),
  voiceName: z.string().optional(),
  ssmlGender: z.enum(["SSML_VOICE_GENDER_UNSPECIFIED", "MALE", "FEMALE", "NEUTRAL"]).optional(),
});

// Model
export class GoogleTTS extends TTSProviderBase<typeof googleTTSConfig> {
  readonly #client: TextToSpeechClient;

  constructor(config: z.input<typeof googleTTSConfig>) {
    super(googleTTSConfig, config);
    const clientConfig: Record<string, string | undefined> = {};
    if (this.config.keyFilename) clientConfig.keyFilename = this.config.keyFilename;
    if (this.config.apiKey) clientConfig.apiKey = this.config.apiKey;
    // If neither, it uses GOOGLE_APPLICATION_CREDENTIALS env var automatically
    this.#client = new TextToSpeechClient(clientConfig);
  }

  async generate(): Promise<op.OperationResult<TTSJob>> {
    // biome-ignore lint/suspicious/useAwait: satisfy abstract method signature
    return await op.attempt(async () => {
      const job = this.createGenerateJob();
      return job;
    });
  }

  protected async receiveText(job: TTSJob, text: string, isLast = false) {
    // Google TTS doesn't support true streaming for synthesizeSpeech in the exact same way as WebSockets usually do
    // (It has synthesizeSpeech which returns full audio, and streamingSynthesize which is bidirectional streaming)
    // For simplicity and consistency with other non-streaming-native behavior if needed, we can use synthesizeSpeech for chunks
    // OR we can implement streamingSynthesize.
    // Given the "receiveText" pattern, we usually want to send chunks.
    // Let's implement simple synthesizeSpeech per chunk for now, or accumulate?
    // Streaming is better for latency.
    // However, the `TextToSpeechClient` in Node.js supports `synthesizeSpeech`.
    // For streaming, we might need to use `streamingSynthesize` but it requires setup.
    // Let's stick to non-streaming per-chunk for the first iteration or accumulate if needed.
    // Actually, calling synthesizeSpeech on every partial text chunk might be choppy if not valid sentences.
    // But verify: The task is "Add Google Cloud Text to Speech".
    // I'll implement per-chunk synthesis for now.

    if (!text.trim()) {
      if (isLast) {
        job._receiveVoiceChunk({ type: "end" });
      }
      return;
    }

    try {
      const request = {
        input: { text },
        // Select the voice and audio configuration type
        voice: {
          languageCode: this.config.language,
          name: this.config.voiceName,
          ssmlGender: this.config.ssmlGender,
        },
        audioConfig: {
          audioEncoding: "LINEAR16" as const, // Match the 16kHz PCM expectation
          sampleRateHertz: 16_000,
        },
      };

      const [response] = await this.#client.synthesizeSpeech(request);
      const audioContent = response.audioContent;

      if (audioContent) {
        // audioContent can be string (base64) or Uint8Array
        let buffer: Buffer;
        if (typeof audioContent === "string") {
          buffer = Buffer.from(audioContent, "base64");
        } else {
          buffer = Buffer.from(audioContent);
        }

        // Convert to Int16Array
        const pcm = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
        job._receiveVoiceChunk({ type: "content", voice: pcm });
      }

      if (isLast) {
        job._receiveVoiceChunk({ type: "end" });
      }
    } catch (error) {
      if (!job._abortController.signal.aborted) {
        job._receiveVoiceChunk({
          type: "error",
          error: error instanceof Error ? error.message : "Google TTS Error",
        });
      }
    }
  }
}
