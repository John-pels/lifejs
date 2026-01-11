import { OpenAI } from "openai";
import { z } from "zod";
import * as op from "@/shared/operation";
import { TTSProviderBase } from "../base";
import type { TTSJob } from "../types";

// Config
export const openaiTTSConfig = z.object({
  provider: z.literal("openai"),
  apiKey: z.string().prefault(process.env.OPENAI_API_KEY as string),
  model: z.enum(["tts-1", "tts-1-hd"]).prefault("tts-1"),
  voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).prefault("alloy"),
  speed: z.number().min(0.25).max(4.0).prefault(1.0),
});

// Model
export class OpenAITTS extends TTSProviderBase<typeof openaiTTSConfig> {
  readonly #openai: OpenAI;

  constructor(config: z.input<typeof openaiTTSConfig>) {
    super(openaiTTSConfig, config);
    this.#openai = new OpenAI({ apiKey: this.config.apiKey });
  }

  async generate(): Promise<op.OperationResult<TTSJob>> {
    // biome-ignore lint/suspicious/useAwait: match abstract method
    return await op.attempt(async () => {
      const job = this.createGenerateJob();
      return job;
    });
  }

  // OpenAI TTS API is not streaming for input text (it expects full text).
  // We buffer text until we get a reasonable chunk or isLast.
  // For simplicity and quality, we might wait for isLast or sentence boundaries.
  // But TTSProviderBase sends delta text.
  // We'll buffer per job.
  readonly #textBuffers: Map<string, string> = new Map();

  protected async receiveText(job: TTSJob, text: string, isLast = false) {
    const currentBuffer = this.#textBuffers.get(job.id) || "";
    const newBuffer = currentBuffer + text;
    this.#textBuffers.set(job.id, newBuffer);

    // If it's the last chunk, process everything.
    // Or if we implemented sentence splitting, we could process partials.
    // For now, to avoid disjointed speech, we only process on isLast.
    // This adds latency but ensures quality.
    // Optimization: Split by sentence (".", "?", "!") and process?
    // But we need to handle "Dr." vs end of sentence.

    // We'll process on isLast for safety.
    if (isLast && newBuffer.trim().length > 0) {
      try {
        const response = await this.#openai.audio.speech.create({
          model: this.config.model, // Safe cast if validated by Zod
          voice: this.config.voice,
          input: newBuffer,
          speed: this.config.speed,
          response_format: "wav", // We need PCM, WAV is closest (has header)
        });

        // Get the audio data as ArrayBuffer
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Strip WAV header to get PCM
        const pcmBuffer = this.stripWavHeader(buffer);

        // Convert to Int16Array
        const pcm = new Int16Array(
          pcmBuffer.buffer,
          pcmBuffer.byteOffset,
          pcmBuffer.byteLength / 2,
        );

        await job._receiveVoiceChunk({ type: "content", voice: pcm });
        await job._receiveVoiceChunk({ type: "end" });
      } catch (error) {
        await job._receiveVoiceChunk({
          type: "error",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      } finally {
        this.#textBuffers.delete(job.id);
      }
    } else if (isLast) {
      // Empty buffer but isLast
      await job._receiveVoiceChunk({ type: "end" });
      this.#textBuffers.delete(job.id);
    }
  }

  private stripWavHeader(buffer: Buffer): Buffer {
    // WAV header is usually 44 bytes, but can vary.
    // We parse it simply.
    if (buffer.length < 44) return buffer;

    // Check "RIFF"
    if (buffer.toString("ascii", 0, 4) !== "RIFF") return buffer;

    // Find "data" chunk
    let offset = 12;
    while (offset < buffer.length) {
      const chunkId = buffer.toString("ascii", offset, offset + 4);
      const chunkSize = buffer.readUInt32LE(offset + 4);

      if (chunkId === "data") {
        const headerSize = offset + 8;
        return buffer.subarray(headerSize, headerSize + chunkSize);
      }

      offset += 8 + chunkSize;
    }

    // Fallback if data chunk not found loop fails (malformed?)
    return buffer.subarray(44);
  }
}
