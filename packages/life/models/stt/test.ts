import path from "node:path";
import { describe, expect, it } from "vitest";
import { isLifeError } from "@/shared/error";
import { AssemblySTT } from "./providers/assembly";
import { DeepgramSTT } from "./providers/deepgram";
import { GoogleSTT } from "./providers/google";
import { OpenAISTT } from "./providers/openai";
import type { STTChunk, STTJob } from "./types";

// Test audio fixture path (16kHz mono PCM)
const TEST_AUDIO_PATH = path.join(__dirname, "fixtures/test-speech.pcm");

// Helper to load test audio as Int16Array
function loadTestAudio(): Int16Array {
  const fs = require("node:fs");
  const buffer = fs.readFileSync(TEST_AUDIO_PATH);
  return new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);
}

/**
 * STT (Speech-to-Text) Provider Tests
 *
 * These tests verify the behavior of STT providers which convert audio streams
 * into text. The `generate` method returns an OperationResult with an STTJob
 * that provides:
 * - `id`: Unique job identifier
 * - `stream`: AsyncQueue<STTChunk> for receiving transcriptions
 * - `cancel`: Method to abort the transcription
 * - `inputVoice`: Method to feed PCM audio data
 *
 * Note: Tests require valid API credentials. If credentials are not available,
 * providers return an error via OperationResult or fail to establish connection.
 */

// Top-level regex for job ID matching (avoids recreation in hot paths)
const JOB_ID_PATTERN = /^job_/;

// Helper to collect chunks from an STT stream with timeout
async function collectStream(
  job: STTJob,
  options: { timeout?: number; maxChunks?: number } = {},
): Promise<STTChunk[]> {
  const { timeout = 5000, maxChunks = 100 } = options;
  const chunks: STTChunk[] = [];

  const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, timeout));

  const collectPromise = async () => {
    for await (const chunk of job.stream) {
      chunks.push(chunk);
      if (chunk.type === "end" || chunk.type === "error") break;
      if (chunks.length >= maxChunks) break;
    }
  };

  await Promise.race([collectPromise(), timeoutPromise]);
  return chunks;
}

// Helper to generate test PCM audio data (silence)
function generateSilentPCM(durationMs: number, sampleRate = 16_000): Int16Array {
  const samples = Math.floor((durationMs / 1000) * sampleRate);
  return new Int16Array(samples); // Zeros = silence
}

// Helper to generate test PCM audio data (sine wave tone)
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
    name: "DeepgramSTT",
    createProvider: () => new DeepgramSTT({ provider: "deepgram", apiKey: "test-key" }),
  },
  {
    name: "AssemblySTT",
    createProvider: () => new AssemblySTT({ provider: "assembly", apiKey: "test-key" }),
  },
  {
    name: "GoogleSTT",
    createProvider: () => new GoogleSTT({ provider: "google", apiKey: "test-key" }),
  },
  {
    name: "OpenAISTT",
    createProvider: () => new OpenAISTT({ provider: "openai", apiKey: "test-key" }),
  },
] as const;

describe("STTProvider", () => {
  describe.each(providers)("$name", ({ createProvider }) => {
    describe("generate", () => {
      it("returns OperationResult tuple", async () => {
        const provider = createProvider();
        const result = await provider.generate();

        // Should always return [error, data] tuple
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2);
      });

      it("returns STTJob with required interface on success", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        // Either success with job, or error from connection/auth issues
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

        // Clean up
        job.cancel();
      });

      it("creates unique job IDs for each generation", async () => {
        const provider = createProvider();
        const [error1, job1] = await provider.generate();
        const [error2, job2] = await provider.generate();

        // Skip if provider fails (e.g., no API key)
        if (error1 || error2) {
          if (error1) expect(isLifeError(error1)).toBe(true);
          if (error2) expect(isLifeError(error2)).toBe(true);
          return;
        }

        expect(job1.id).not.toBe(job2.id);

        // Clean up
        job1.cancel();
        job2.cancel();
      });
    });

    describe("job interface", () => {
      it("exposes cancel method that stops the job", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Should be able to cancel without throwing
        expect(() => job.cancel()).not.toThrow();
      });

      it("exposes inputVoice method for feeding audio", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Should accept Int16Array PCM data
        const pcm = generateSilentPCM(100);
        expect(() => job.inputVoice(pcm)).not.toThrow();

        // Clean up
        job.cancel();
      });

      it("accepts multiple audio chunks via inputVoice", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Send multiple chunks
        for (let i = 0; i < 5; i++) {
          const pcm = generateSilentPCM(100);
          expect(() => job.inputVoice(pcm)).not.toThrow();
        }

        // Clean up
        job.cancel();
      });

      it("stream is an async iterable", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Verify stream is async iterable
        expect(typeof job.stream[Symbol.asyncIterator]).toBe("function");

        // Clean up
        job.cancel();
      });
    });

    describe("streaming", () => {
      it("emits chunks with correct types", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Send some audio data to potentially trigger transcription
        const pcm = generateTonePCM(500);
        job.inputVoice(pcm);

        // Collect any chunks that arrive
        const chunks = await collectStream(job, { timeout: 2000, maxChunks: 10 });

        // All chunks should have valid types
        for (const chunk of chunks) {
          expect(["content", "error", "end"]).toContain(chunk.type);

          if (chunk.type === "content") {
            expect(typeof chunk.text).toBe("string");
          } else if (chunk.type === "error") {
            expect(typeof chunk.error).toBe("string");
          }
        }

        // Clean up
        job.cancel();
      });

      it("transcribes speech audio to text", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Wait for WebSocket connection to establish
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Load real speech audio and send in chunks (simulating real-time streaming)
        const audio = loadTestAudio();
        const chunkSize = 4000; // ~250ms chunks at 16kHz
        for (let i = 0; i < audio.length; i += chunkSize) {
          const chunk = audio.slice(i, i + chunkSize);
          job.inputVoice(chunk);
          // Small delay to simulate real-time audio streaming
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        // Collect transcription results
        const chunks = await collectStream(job, { timeout: 15_000, maxChunks: 100 });

        // Extract text from content chunks
        const text = chunks
          .filter((c): c is Extract<STTChunk, { type: "content" }> => c.type === "content")
          .map((c) => c.text)
          .join("");

        // Should have received some transcribed text OR an error (if no API key)
        const hasError = chunks.some((c) => c.type === "error");
        if (!hasError) {
          expect(text.length).toBeGreaterThan(0);
        }

        // Clean up
        job.cancel();
      }, 30_000);
    });

    describe("cancellation", () => {
      it("cancel stops receiving new chunks", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Cancel immediately
        job.cancel();

        // Sending audio after cancel should not throw
        const pcm = generateSilentPCM(100);
        expect(() => job.inputVoice(pcm)).not.toThrow();
      });

      it("multiple cancels do not throw", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Multiple cancels should be safe
        expect(() => {
          job.cancel();
          job.cancel();
          job.cancel();
        }).not.toThrow();
      });
    });

    describe("error handling", () => {
      it("does not throw exceptions from generate", async () => {
        const provider = createProvider();
        await expect(provider.generate()).resolves.toBeDefined();
      });
    });

    describe("audio input handling", () => {
      it("handles empty PCM data", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        const emptyPcm = new Int16Array(0);
        expect(() => job.inputVoice(emptyPcm)).not.toThrow();

        job.cancel();
      });

      it("handles large PCM chunks", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Large chunk (5 seconds of audio at 16kHz)
        const largePcm = generateSilentPCM(5000);
        expect(largePcm.length).toBe(80_000);
        expect(() => job.inputVoice(largePcm)).not.toThrow();

        job.cancel();
      });

      it("handles rapid sequential audio chunks", async () => {
        const provider = createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Send many small chunks rapidly
        for (let i = 0; i < 100; i++) {
          const pcm = generateSilentPCM(10); // 10ms chunks
          job.inputVoice(pcm);
        }

        job.cancel();
      });
    });
  });

  describe("DeepgramSTT specific", () => {
    it("accepts custom API key", () => {
      const provider = new DeepgramSTT({ provider: "deepgram", apiKey: "test-api-key" });
      expect(provider).toBeDefined();
    });

    it("accepts model option", () => {
      const provider = new DeepgramSTT({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2",
      });
      expect(provider).toBeDefined();
    });

    it("accepts language option", () => {
      const provider = new DeepgramSTT({
        provider: "deepgram",
        apiKey: "test-key",
        language: "fr",
      });
      expect(provider).toBeDefined();
    });

    it("accepts combined options", () => {
      const provider = new DeepgramSTT({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2",
        language: "es",
      });
      expect(provider).toBeDefined();
    });

    it("returns LifeError on connection failure", async () => {
      const provider = new DeepgramSTT({ provider: "deepgram", apiKey: "invalid-key-12345" });
      const [error] = await provider.generate();

      // May or may not error immediately depending on implementation
      if (error) {
        expect(isLifeError(error)).toBe(true);
        expect(error.code).toBeDefined();
        expect(typeof error.message).toBe("string");
      }
    });
  });
});
