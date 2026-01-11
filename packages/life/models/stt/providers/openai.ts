import { OpenAI } from "openai";
import { toFile } from "openai/uploads";
import { z } from "zod";
import * as op from "@/shared/operation";
import type { STTJob } from "../types";
import { STTProviderBase } from "./base";

// Config
export const openaiSTTConfig = z.object({
  provider: z.literal("openai"),
  apiKey: z.string().prefault(process.env.OPENAI_API_KEY as string),
  model: z.string().prefault("whisper-1"),
  language: z.string().optional(), // Whisper auto-detects if not provided
});

// Model
export class OpenAISTT extends STTProviderBase<typeof openaiSTTConfig> {
  readonly #openai: OpenAI;
  readonly #jobsChunks = new Map<string, Int16Array[]>();

  constructor(config: z.input<typeof openaiSTTConfig>) {
    super(openaiSTTConfig, config);
    this.#openai = new OpenAI({ apiKey: this.config.apiKey });
  }

  async generate(): Promise<op.OperationResult<STTJob>> {
    // biome-ignore lint/suspicious/useAwait: need async to match STTBase abstract method
    return await op.attempt(async () => {
      const job = this.createGenerateJob();

      // Handle raw PCM input
      // Since OpenAI Whisper doesn't support streaming PCM,
      // we'll implement a strategy where we buffer the audio.
      // NOTE: This provider does not emit partial results.
      // It emits the full transcript when the job is cancelled/ended or we decide to flush.
      // For now, we wait for 'cancel' to process the buffer as a "turn".

      // Override the default receiveVoice to buffer
      // We attach a custom handler to the job to capture the voice data
      // But STTProviderBase calls receiveVoice.

      // There is no "end" signal in STTJob except cancel.
      // So we will hook into the cleanup/cancel logic to transcribe.

      const originalCancel = job.cancel;
      job.cancel = () => {
        if (job._abortController.signal.aborted) return;

        // Trigger transcription on cancel before aborting?
        // Actually, if we abort, we can't push to stream?
        // job.stream is just an async queue. Even if aborted, we might be able to push?
        // But usually cancel means "stop everything".

        // Let's try to transcribe safely.
        this.transcribeBuffer(job).finally(() => {
          originalCancel();
        });
      };

      return job;
    });
  }

  // biome-ignore lint/suspicious/useAwait: satisfy abstract method signature
  protected async receiveVoice(job: STTJob, pcm: Int16Array): Promise<void> {
    // If the job is aborted, stop.
    if (job._abortController.signal.aborted) return;

    // Append to buffer (inefficient for very long streams, but Whisper is for short turns usually)
    // We convert Int16Array to standard array or manageable chunks?
    // Let's keep it as array of numbers for simplicity in concatenation,
    // or better: list of Int16Arrays.
    if (!this.#jobsChunks.has(job.id)) {
      this.#jobsChunks.set(job.id, []);
    }
    this.#jobsChunks.get(job.id)?.push(pcm);
  }

  private async transcribeBuffer(job: STTJob) {
    const chunks = this.#jobsChunks.get(job.id) || [];
    if (chunks.length === 0) return;

    // Calculate total length
    const totalLen = chunks.reduce((acc, c) => acc + c.length, 0);
    const output = new Int16Array(totalLen);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.length;
    }

    if (output.length === 0) return;

    try {
      // Convert PCM to WAV
      // Whisper API requires a file (wav, mp3, etc.)
      const wavBuffer = this.pcmToWav(output, 16_000);

      // Create a File object for OpenAI
      const file = await toFile(wavBuffer, "speech.wav", { type: "audio/wav" });

      const response = await this.#openai.audio.transcriptions.create({
        file,
        model: this.config.model,
        language: this.config.language,
      });

      if (response.text) {
        job.stream.push({ type: "content", text: response.text });
      }
    } catch (error) {
      job.stream.push({
        type: "error",
        error: error instanceof Error ? error.message : "Unknown OpenAI error",
      });
    } finally {
      this.#jobsChunks.delete(job.id);
    }
  }

  // Helper to convert raw PCM 16-bit to WAV buffer
  private pcmToWav(samples: Int16Array, sampleRate: number): Buffer {
    const numChannels = 1;
    const byteRate = sampleRate * numChannels * 2;
    const blockAlign = numChannels * 2;
    const dataSize = samples.length * 2;
    const buffer = Buffer.alloc(44 + dataSize);

    // RIFF chunk
    buffer.write("RIFF", 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write("WAVE", 8);

    // fmt sub-chunk
    buffer.write("fmt ", 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
    buffer.writeUInt16LE(numChannels, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(byteRate, 28);
    buffer.writeUInt16LE(blockAlign, 32);
    buffer.writeUInt16LE(16, 34); // BitsPerSample

    // data sub-chunk
    buffer.write("data", 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Write samples
    const dataBuffer = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
    dataBuffer.copy(buffer, 44);

    return buffer;
  }
}
