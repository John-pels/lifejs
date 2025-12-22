import { InferenceSession, Tensor } from "onnxruntime-node";
import { z } from "zod";
import * as op from "@/shared/operation";
import { RemoteFile } from "@/shared/remote-file";
import type { VADJob } from "../types";
import { VADProviderBase } from "./base";

// The Silero VAD model has been trainedcon 64 chunks of context plus 512 chunks of fresh audio data (= 576 chunks).
const WINDOW_SIZE = 64 + 512;

// 16kHz sample rate
const SAMPLE_RATE = 16_000;

// Config
export const sileroVADConfig = z.object({
  provider: z.literal("silero"),
});

// Model
export class SileroVAD extends VADProviderBase<typeof sileroVADConfig> {
  readonly #jobsStates: Map<string, Tensor> = new Map();
  readonly #jobsSessions: Map<string, InferenceSession> = new Map();
  readonly #jobsContextWindows: Map<string, Float32Array> = new Map();

  constructor(config: z.input<typeof sileroVADConfig>) {
    super(sileroVADConfig, config);
  }

  async detect(): Promise<op.OperationResult<VADJob>> {
    return await op.attempt(async () => {
      // Create a new generation job
      const job = this.createGenerateJob();

      // Download model if needed and create ONNX inference session
      const model = new RemoteFile({ name: "Silero VAD", remotePath: "vad-silero-6.2.onnx" });
      const [error, modelPath] = await model.getLocalPath();
      if (error) throw error;
      const session = await InferenceSession.create(modelPath);
      this.#jobsSessions.set(job.id, session);

      // Initialize the state tensor
      const state = new Tensor("float32", new Float32Array(2 * 1 * 128), [2, 1, 128]);
      this.#jobsStates.set(job.id, state);

      // Clean up the session on job cancellation
      job._abortController.signal.addEventListener("abort", async () => {
        await session.release();
        this.#jobsStates.delete(job.id);
        this.#jobsSessions.delete(job.id);
        this.#jobsContextWindows.delete(job.id);
      });

      return job;
    });
  }

  protected async receiveVoice(job: VADJob, pcm: Int16Array) {
    if (job._abortController.signal.aborted) return;
    const session = this.#jobsSessions.get(job.id);
    if (!session) return;

    // Split input into WINDOW_SIZE chunks and process sequentially
    for (let i = 0; i < pcm.length; i += WINDOW_SIZE) {
      if (job._abortController.signal.aborted) return;
      const chunk = pcm.subarray(i, Math.min(i + WINDOW_SIZE, pcm.length));
      const score = await this.#runInference(job, chunk);
      if (score === null) return;
      job.stream.push({ type: "result", chunk, score });
    }
  }

  async #runInference(job: VADJob, pcm: Int16Array): Promise<number | null> {
    if (job._abortController.signal.aborted) return null;
    // Convert incoming PCM audio to Float32
    const newSamples = this.#int16ToFloat32(pcm);

    // Compute the new context window
    // This a rolling buffer, we basically do [...oldSamples, ...newSamples].slice(-WINDOW_SIZE)
    const contextWindow = this.#jobsContextWindows.get(job.id) ?? new Float32Array(WINDOW_SIZE);
    const newSamplesStartAt = WINDOW_SIZE - newSamples.length;
    const oldSamples = contextWindow.slice(-newSamplesStartAt);
    contextWindow.set(oldSamples, 0);
    contextWindow.set(newSamples, newSamplesStartAt);
    this.#jobsContextWindows.set(job.id, contextWindow);

    // Run ONNX model inference
    const session = this.#jobsSessions.get(job.id);
    if (!session) return null;
    const input = new Tensor("float32", contextWindow, [1, contextWindow.length]);
    const state = this.#jobsStates.get(job.id);
    if (!state) return null;
    const sr = new Tensor("int64", BigInt64Array.from([BigInt(SAMPLE_RATE)]));

    try {
      const result = await session.run({ input, state, sr });
      if (result.stateN) this.#jobsStates.set(job.id, result.stateN);
      const score = Number(result.output?.data?.[0]) ?? 0;
      return score;
    } catch {
      if (job._abortController.signal.aborted) return null;
      throw new Error("ONNX inference failed");
    }
  }

  #int16ToFloat32(src: Int16Array, dst?: Float32Array) {
    const out = dst ?? new Float32Array(src.length);
    for (let i = 0; i < src.length; ++i) out[i] = (src[i] as number) / 32_768;
    return out;
  }
}
