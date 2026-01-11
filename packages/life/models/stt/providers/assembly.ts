import { AssemblyAI, type RealtimeTranscriber } from "assemblyai";
import { z } from "zod";
import * as op from "@/shared/operation";
import type { STTJob } from "../types";
import { STTProviderBase } from "./base";

// Config
export const assemblySTTConfig = z.object({
  provider: z.literal("assembly"),
  apiKey: z.string().prefault(process.env.ASSEMBLYAI_API_KEY as string),
  sampleRate: z.number().prefault(16_000),
});

// Model
export class AssemblySTT extends STTProviderBase<typeof assemblySTTConfig> {
  readonly #client: AssemblyAI;
  readonly #activeTranscribers: Map<string, RealtimeTranscriber> = new Map();

  constructor(config: z.input<typeof assemblySTTConfig>) {
    super(assemblySTTConfig, config);
    this.#client = new AssemblyAI({ apiKey: this.config.apiKey });
  }

  async generate(): Promise<op.OperationResult<STTJob>> {
    return await op.attempt(async () => {
      const job = this.createGenerateJob();

      const transcriber = this.#client.realtime.transcriber({
        sampleRate: this.config.sampleRate,
      });

      transcriber.on("open", ({ sessionId }) => {
        // Session opened
        void sessionId;
      });

      transcriber.on("error", (error: Error) => {
        if (!job._abortController.signal.aborted) {
          job.stream.push({ type: "error", error: error.message });
        }
      });

      transcriber.on("transcript", (transcript) => {
        if (!transcript.text) return;

        // We can send partials or only finals.
        // The interface supports continuous stream of text.
        // deepgram provider sends alternatives[0]?.transcript.

        // AssemblyAI emits "Partial" and "Final".
        // If we send partials, we might get "Hello" "Hello world" duplication if not handled by consumer?
        // But Deepgram provider sends everything.
        // STTChunk is { type: 'content', text: string }.
        // If the consumer accumulates, partials might overwrite?
        // Let's assume consumer handles partial updates or we should only send Final or stable text?

        // Looking at generic STT usage, usually live updates are desired.
        // Deepgram implementation: `const text = msg.channel.alternatives[0]?.transcript;`
        // Deepgram sends `is_final` flag too but `deepgram.ts` doesn't check it!
        // It just pushes `content`.
        // This implies the consumer (User) handles simple stream of text updates (or maybe the UI filters it).
        // I will send `transcript.text` whenever available.

        job.stream.push({ type: "content", text: transcript.text });
      });

      await transcriber.connect();
      this.#activeTranscribers.set(job.id, transcriber);

      job._abortController.signal.addEventListener("abort", () => {
        const t = this.#activeTranscribers.get(job.id);
        if (t) {
          t.close().catch(() => {
            // Ignore close errors
          });
          this.#activeTranscribers.delete(job.id);
        }
      });

      return job;
    });
  }

  // biome-ignore lint/suspicious/useAwait: match abstract signature
  protected async receiveVoice(job: STTJob, pcm: Int16Array) {
    const transcriber = this.#activeTranscribers.get(job.id);
    if (transcriber) {
      // AssemblyAI RealtimeTranscriber.sendAudio expects ArrayBufferLike
      // We slice the underlying buffer to ensure we only send the relevant bytes
      const arrayBuffer = pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength);
      try {
        transcriber.sendAudio(arrayBuffer);
      } catch (_error) {
        // Ignore send errors
      }
    }
  }
}
