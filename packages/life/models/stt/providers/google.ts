import type { Duplex } from "node:stream";
import { SpeechClient } from "@google-cloud/speech";
import { z } from "zod";
import * as op from "@/shared/operation";
import type { STTJob } from "../types";
import { STTProviderBase } from "./base";

// Config
export const googleSTTConfig = z.object({
  provider: z.literal("google"),
  apiKey: z.string().optional(), // Google usually uses keyFile or default credentials
  keyFilename: z.string().optional(),
  language: z.string().prefault("en-US"),
});

// Model
export class GoogleSTT extends STTProviderBase<typeof googleSTTConfig> {
  readonly #client: SpeechClient;
  // The stream returned by streamingRecognize is a Pumpify stream which mimics a Duplex stream
  // We can treat it as a Duplex stream which has destroy/destroyed in recent node versions or we just cast
  readonly #activeStreams: Map<string, Duplex> = new Map();

  constructor(config: z.input<typeof googleSTTConfig>) {
    super(googleSTTConfig, config);
    const clientConfig: Record<string, string | undefined> = {};
    if (this.config.keyFilename) clientConfig.keyFilename = this.config.keyFilename;
    if (this.config.apiKey) clientConfig.apiKey = this.config.apiKey;
    // If neither, it uses GOOGLE_APPLICATION_CREDENTIALS env var automatically
    this.#client = new SpeechClient(clientConfig);
  }

  async generate(): Promise<op.OperationResult<STTJob>> {
    // biome-ignore lint/suspicious/useAwait: need async to match STTBase abstract method
    return await op.attempt(async () => {
      const job = this.createGenerateJob();

      const request = {
        config: {
          encoding: "LINEAR16" as const,
          sampleRateHertz: 16_000,
          languageCode: this.config.language,
        },
        interimResults: true,
      };

      const recognizeStream = this.#client
        .streamingRecognize(request)
        .on("error", (err) => {
          if (!job._abortController.signal.aborted) {
            job.stream.push({ type: "error", error: err.message });
          }
        })
        .on("data", (data) => {
          if (data.results?.[0]?.alternatives?.[0]) {
            const text = data.results[0].alternatives[0].transcript;
            if (text) {
              job.stream.push({ type: "content", text });
            }
          }
        });

      this.#activeStreams.set(job.id, recognizeStream as unknown as Duplex);

      // Handle abort
      job._abortController.signal.addEventListener("abort", () => {
        const stream = this.#activeStreams.get(job.id);
        if (stream) {
          stream.end();
          stream.destroy();
          this.#activeStreams.delete(job.id);
        }
      });

      return job;
    });
  }

  // biome-ignore lint/suspicious/useAwait: satisfy abstract method signature
  protected async receiveVoice(job: STTJob, pcm: Int16Array) {
    const stream = this.#activeStreams.get(job.id);
    if (stream && !stream.destroyed) {
      // Google expects Buffer
      const buffer = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
      stream.write(buffer);
    }
  }
}
