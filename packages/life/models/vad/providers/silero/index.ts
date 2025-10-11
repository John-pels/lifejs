import path from "node:path";
import { fileURLToPath } from "node:url";
import { InferenceSession, Tensor } from "onnxruntime-node";
import { z } from "zod";
import { createConfig } from "@/shared/config";
import { VADBase } from "../../base";

const WINDOW_SAMPLES = 512;
const HOP_SAMPLES = 160;
const PAST_CONTEXT_SAMPLES = 64;
const SAMPLE_RATE = 16_000n;

// Config
export const sileroVADConfig = createConfig({
  schema: z.object({
    provider: z.literal("silero"),
  }),
  toTelemetryAttribute: (config) => {
    return config;
  },
});

// Model
export class SileroVAD extends VADBase<typeof sileroVADConfig.schema> {
  #_session: InferenceSession | null = null;
  // RNN latent state (2 × 1 × 128). Re‑used between calls.
  readonly #rnnState = new Float32Array(2 * 1 * 128);
  // ONNX tensor for the constant sample‑rate value.
  readonly #srTensor = new BigInt64Array([SAMPLE_RATE]);
  // Context window created once to avoid unnecessary allocations
  readonly #contextWindow = new Float32Array(PAST_CONTEXT_SAMPLES + WINDOW_SAMPLES);
  // Past context provided to the model (64 samples), also created once for performance
  readonly #pastContext = new Float32Array(PAST_CONTEXT_SAMPLES);
  // Holds residual samples from previous calls
  #residual = new Float32Array(0);

  constructor(config: z.input<typeof sileroVADConfig.schema>) {
    super(sileroVADConfig.schema, config);
  }

  // Get or create the ONNX inference session
  async #getSession(): Promise<InferenceSession> {
    if (this.#_session) return this.#_session;

    // Retrieve model path
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const modelPath = path.join(
      currentDir,
      "..",
      "models",
      "vad",
      "providers",
      "silero",
      "model-16k.onnx",
    );

    this.#_session = await InferenceSession.create(modelPath, {
      interOpNumThreads: 1,
      intraOpNumThreads: 1,
      executionMode: "sequential",
    });
    return this.#_session;
  }

  // Converts 16‑bit PCM to normalized 32‑bit float (‑1 … 1).
  #int16ToFloat32(src: Int16Array, dst?: Float32Array) {
    const out = dst ?? new Float32Array(src.length);
    for (let i = 0; i < src.length; ++i) out[i] = (src[i] as number) / 32_768;
    return out;
  }

  /**
   * Check voice activity of one 10ms chunk (160 samples) of 16‑bit PCM audio.
   * After the initial warm‑up (3 calls) a probability in the range [0,1] is returned.
   * Until then, 0 is returned.
   * @param pcm – Int16Array of length 160 (10ms @ 16 kHz)
   */
  async checkActivity(pcm: Int16Array): Promise<number> {
    // 1. Convert to Float32 in‑place (no allocations after warm‑up)
    const f32 = this.#int16ToFloat32(pcm);

    // 2. Concatenate with residual samples from previous call
    const concatenated = new Float32Array(this.#residual.length + f32.length);
    concatenated.set(this.#residual);
    concatenated.set(f32, this.#residual.length);

    // 3. Return 0 if we don't have enough samples yet to run the inference
    // (need at least 32ms of context before first inference)
    if (concatenated.length < WINDOW_SAMPLES) {
      this.#residual = concatenated;
      return 0;
    }

    // 4. Slice last 32ms window & update residual (< 22ms)
    const frameStart = concatenated.length - WINDOW_SAMPLES;
    const currentFrame = concatenated.subarray(frameStart);
    this.#residual = concatenated.subarray(frameStart + HOP_SAMPLES);

    // 5. Prepare contextWindow = [pastContext | currentFrame]
    this.#contextWindow.set(this.#pastContext); // copy past context
    this.#contextWindow.set(currentFrame, PAST_CONTEXT_SAMPLES);

    // 6. Run ONNX inference
    const session = await this.#getSession();
    const { output, stateN } = (await session.run({
      input: new Tensor("float32", this.#contextWindow, [1, this.#contextWindow.length]),
      state: new Tensor("float32", this.#rnnState, [2, 1, 128]),
      sr: new Tensor("int64", this.#srTensor),
    })) as Record<string, Tensor>;
    if (!(output && stateN)) throw new Error("Unexpected ONNX output");

    // 7. Persist state & past context for next call
    this.#rnnState.set(stateN.data as Float32Array);
    this.#pastContext.set(
      this.#contextWindow.subarray(this.#contextWindow.length - PAST_CONTEXT_SAMPLES),
    );

    return (output.data as Float32Array)[0] ?? 0;
  }
}
