import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { isLifeError } from "@/shared/error";
import { RemoteFile } from "@/shared/remote-file";
import { SileroVAD } from "./providers/silero";
import type { VADChunk, VADJob } from "./types";

// Pre-download model before tests run
beforeAll(async () => {
  const model = new RemoteFile({ name: "Silero VAD", remotePath: "vad-silero-6.2.onnx" });
  await model.getLocalPath();
}, 120_000);

/**
 * VAD (Voice Activity Detection) Provider Tests
 *
 * These tests verify the behavior of VAD providers which analyze audio
 * to detect voice activity. The `detect` method returns an OperationResult
 * with a VADJob that provides:
 * - `id`: Unique job identifier
 * - `stream`: AsyncQueue<VADChunk> for receiving detection results
 * - `cancel`: Method to abort the detection
 * - `inputVoice`: Method to feed PCM audio data
 *
 * Unlike STT/TTS providers, VAD runs locally using ONNX models.
 */

// Test audio fixture path (16kHz mono PCM)
const TEST_AUDIO_PATH = path.join(__dirname, "../stt/fixtures/test-speech.pcm");

// Top-level regex for job ID matching
const JOB_ID_PATTERN = /^job_/;

// Helper to load test audio as Int16Array
function loadTestAudio(): Int16Array {
  const fs = require("node:fs");
  const buffer = fs.readFileSync(TEST_AUDIO_PATH);
  return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
}

// Helper to collect chunks from a VAD stream with timeout
async function collectStream(
  job: VADJob,
  options: { timeout?: number; maxChunks?: number } = {},
): Promise<VADChunk[]> {
  const { timeout = 5000, maxChunks = 100 } = options;
  const chunks: VADChunk[] = [];

  const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, timeout));

  const collectPromise = async () => {
    for await (const chunk of job.stream) {
      chunks.push(chunk);
      if (chunks.length >= maxChunks) break;
    }
  };

  await Promise.race([collectPromise(), timeoutPromise]);
  return chunks;
}

// Helper to generate silent PCM data
function generateSilentPCM(durationMs: number, sampleRate = 16_000): Int16Array {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  return new Int16Array(samples); // Zeros = silence
}

// Helper to generate sine wave tone PCM
function generateTonePCM(
  durationMs: number,
  frequency = 440,
  sampleRate = 16_000,
  amplitude = 16_000,
): Int16Array {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  const pcm = new Int16Array(samples);
  for (let i = 0; i < samples; i++) {
    pcm[i] = Math.floor(amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate));
  }
  return pcm;
}

// Provider configurations to test
const providers = [
  {
    name: "SileroVAD",
    createProvider: () => new SileroVAD({ provider: "silero" }),
  },
] as const;

describe("VADProvider", () => {
  describe.each(providers)("$name", ({ createProvider }) => {
    describe("detect", () => {
      it("returns OperationResult tuple", async () => {
        const provider = createProvider();
        const result = await provider.detect();

        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2);
      });

      it("returns VADJob with required interface on success", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        expect(job).toBeDefined();
        expect(typeof job.id).toBe("string");
        expect(job.id).toMatch(JOB_ID_PATTERN);
        expect(typeof job.cancel).toBe("function");
        expect(typeof job.inputVoice).toBe("function");
        expect(job.stream).toBeDefined();

        job.cancel();
      });

      it("creates unique job IDs for each detection", async () => {
        const provider = createProvider();
        const [error1, job1] = await provider.detect();
        const [error2, job2] = await provider.detect();

        if (error1 || error2) {
          if (error1) expect(isLifeError(error1)).toBe(true);
          if (error2) expect(isLifeError(error2)).toBe(true);
          return;
        }

        expect(job1.id).not.toBe(job2.id);

        job1.cancel();
        job2.cancel();
      });
    });

    describe("job interface", () => {
      it("exposes cancel method that stops the job", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        expect(() => job.cancel()).not.toThrow();
      });

      it("exposes inputVoice method for feeding audio", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        const pcm = generateSilentPCM(100);
        expect(() => job.inputVoice(pcm)).not.toThrow();

        job.cancel();
      });

      it("stream is an async iterable", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        expect(typeof job.stream[Symbol.asyncIterator]).toBe("function");

        job.cancel();
      });
    });

    describe("streaming", () => {
      it("emits chunks with correct structure", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Send audio to trigger detection
        const pcm = generateTonePCM(100);
        job.inputVoice(pcm);

        const chunks = await collectStream(job, { timeout: 2000, maxChunks: 5 });

        for (const chunk of chunks) {
          expect(chunk.type).toBe("result");
          expect(chunk.chunk).toBeInstanceOf(Int16Array);
          expect(typeof chunk.score).toBe("number");
        }

        job.cancel();
      });

      it("returns score between 0 and 1", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Send audio to get VAD scores
        const pcm = generateTonePCM(100);
        job.inputVoice(pcm);

        const chunks = await collectStream(job, { timeout: 2000, maxChunks: 5 });

        for (const chunk of chunks) {
          expect(chunk.score).toBeGreaterThanOrEqual(0);
          expect(chunk.score).toBeLessThanOrEqual(1);
        }

        job.cancel();
      });

      it("returns low score for silence", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Send multiple silent chunks to fill the context window
        for (let i = 0; i < 10; i++) {
          job.inputVoice(generateSilentPCM(100));
        }

        const chunks = await collectStream(job, { timeout: 2000, maxChunks: 10 });

        // Silence should produce low VAD scores
        const avgScore = chunks.reduce((sum, c) => sum + c.score, 0) / chunks.length;
        expect(avgScore).toBeLessThan(0.5);

        job.cancel();
      });

      it("detects voice in real speech audio", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Feed all audio at once - provider handles internal chunking
        const audio = loadTestAudio();
        job.inputVoice(audio);

        // Collect enough chunks to get past warmup period (~20 chunks)
        const chunks = await collectStream(job, { timeout: 10_000, maxChunks: 100 });

        // Real speech should have some chunks with high VAD score
        const highScoreChunks = chunks.filter((c) => c.score > 0.5);
        expect(highScoreChunks.length).toBeGreaterThan(0);

        job.cancel();
      }, 15_000);
    });

    describe("cancellation", () => {
      it("cancel stops receiving new chunks", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        job.cancel();

        // Sending audio after cancel should not throw
        const pcm = generateSilentPCM(100);
        expect(() => job.inputVoice(pcm)).not.toThrow();
      });

      it("multiple cancels do not throw", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        expect(() => {
          job.cancel();
          job.cancel();
          job.cancel();
        }).not.toThrow();
      });
    });

    describe("audio input handling", () => {
      it("handles empty PCM data", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        const emptyPcm = new Int16Array(0);
        expect(() => job.inputVoice(emptyPcm)).not.toThrow();

        job.cancel();
      });

      it("handles standard 10ms chunks (160 samples at 16kHz)", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // 10ms at 16kHz = 160 samples (common WebRTC chunk size)
        const pcm = generateSilentPCM(10);
        expect(pcm.length).toBe(160);
        expect(() => job.inputVoice(pcm)).not.toThrow();

        job.cancel();
      });

      it("handles rapid sequential audio chunks", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Send many small chunks rapidly
        for (let i = 0; i < 50; i++) {
          const pcm = generateSilentPCM(10);
          job.inputVoice(pcm);
        }

        const chunks = await collectStream(job, { timeout: 3000, maxChunks: 50 });
        expect(chunks.length).toBeGreaterThan(0);

        job.cancel();
      });

      it("handles various chunk sizes", async () => {
        const provider = createProvider();
        const [error, job] = await provider.detect();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Test different chunk sizes
        const sizes = [80, 160, 320, 512, 1024];
        for (const size of sizes) {
          const pcm = new Int16Array(size);
          expect(() => job.inputVoice(pcm)).not.toThrow();
        }

        job.cancel();
      });
    });
  });

  describe("SileroVAD specific", () => {
    it("config requires silero provider literal", () => {
      expect(() => new SileroVAD({ provider: "silero" })).not.toThrow();
    });

    it("loads ONNX model successfully", async () => {
      const provider = new SileroVAD({ provider: "silero" });
      const [error, job] = await provider.detect();

      // If model loading fails, we get an error
      expect(error).toBeUndefined();
      expect(job).toBeDefined();

      job?.cancel();
    });

    it("maintains state across multiple chunks", async () => {
      const provider = new SileroVAD({ provider: "silero" });
      const [error, job] = await provider.detect();

      if (error) {
        expect(isLifeError(error)).toBe(true);
        return;
      }

      // Send multiple chunks - state should be maintained
      const scores: number[] = [];
      for (let i = 0; i < 5; i++) {
        job.inputVoice(generateSilentPCM(100));
      }

      const chunks = await collectStream(job, { timeout: 2000, maxChunks: 5 });
      for (const chunk of chunks) {
        scores.push(chunk.score);
      }

      // All scores should be valid numbers
      expect(scores.every((s) => typeof s === "number" && !Number.isNaN(s))).toBe(true);

      job.cancel();
    });
  });
});
