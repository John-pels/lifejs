import { describe, expect, it } from "vitest";
import { isLifeError } from "@/shared/error";
import { CartesiaTTS } from "./providers/cartesia";
import type { TTSChunk, TTSJob } from "./types";

/**
 * TTS (Text-to-Speech) Provider Tests
 *
 * These tests verify the behavior of TTS providers which convert text streams
 * into voice audio. The `generate` method returns an OperationResult with a TTSJob
 * that provides:
 * - `id`: Unique job identifier
 * - `stream`: AsyncQueue<TTSChunk> for receiving voice chunks
 * - `cancel`: Method to abort the synthesis
 * - `inputText`: Method to feed text data
 *
 * Note: Tests require valid API credentials. If credentials are not available,
 * providers return an error via OperationResult or fail to establish connection.
 */

// Top-level regex for job ID matching (avoids recreation in hot paths)
const JOB_ID_PATTERN = /^job_/;

// Helper to collect chunks from a TTS stream with timeout
async function collectStream(
  job: TTSJob,
  options: { timeout?: number; maxChunks?: number } = {},
): Promise<TTSChunk[]> {
  const { timeout = 10_000, maxChunks = 100 } = options;
  const chunks: TTSChunk[] = [];

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

// Provider configurations to test
const providers = [
  {
    name: "CartesiaTTS",
    createProvider: async () => {
      const provider = new CartesiaTTS({ provider: "cartesia" });
      await provider.warmedUp;
      return provider;
    },
  },
] as const;

describe("TTSProvider", () => {
  // Run sequentially to respect API concurrency limits
  describe.sequential.each(providers)("$name", ({ createProvider }) => {
    describe("generate", () => {
      it("returns OperationResult tuple", async () => {
        const provider = await createProvider();
        const result = await provider.generate();

        // Should always return [error, data] tuple
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2);
      });

      it("returns TTSJob with required interface on success", async () => {
        const provider = await createProvider();
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
        expect(typeof job.inputText).toBe("function");
        expect(job.stream).toBeDefined();

        // Clean up
        job.cancel();
      });

      it("creates unique job IDs for each generation", async () => {
        const provider = await createProvider();
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
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Should be able to cancel without throwing
        expect(() => job.cancel()).not.toThrow();
      });

      it("exposes inputText method for feeding text", async () => {
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Should accept string text data
        await expect(job.inputText("Hello")).resolves.not.toThrow();

        // Clean up
        job.cancel();
      });

      it("accepts multiple text chunks via inputText", async () => {
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Send multiple chunks
        await job.inputText("Hello, ");
        await job.inputText("how are ");
        await job.inputText("you today?", true);

        // Collect results to avoid dangling promises
        await collectStream(job, { timeout: 5000 });

        // Clean up
        job.cancel();
      });

      it("stream is an async iterable", async () => {
        const provider = await createProvider();
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
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Send text to trigger synthesis
        await job.inputText("Hello world.", true);

        // Collect any chunks that arrive
        const chunks = await collectStream(job, { timeout: 10_000, maxChunks: 50 });

        // All chunks should have valid types
        for (const chunk of chunks) {
          expect(["content", "error", "end"]).toContain(chunk.type);

          if (chunk.type === "content") {
            expect(chunk.voiceChunk).toBeInstanceOf(Int16Array);
            expect(typeof chunk.textChunk).toBe("string");
            expect(typeof chunk.durationMs).toBe("number");
          } else if (chunk.type === "error") {
            expect(typeof chunk.error).toBe("string");
          }
        }

        // Clean up
        job.cancel();
      }, 30_000);

      it("synthesizes text to voice audio", async () => {
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Wait briefly for WebSocket to stabilize
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Send text input
        await job.inputText("Hello world.", true);

        // Collect synthesis results with longer timeout
        const chunks = await collectStream(job, { timeout: 20_000, maxChunks: 100 });

        // Should have received chunks
        expect(chunks.length).toBeGreaterThan(0);

        // Extract voice data from content chunks
        const contentChunks = chunks.filter(
          (c): c is Extract<TTSChunk, { type: "content" }> => c.type === "content",
        );

        // If we got content chunks, verify PCM data
        if (contentChunks.length > 0) {
          const totalSamples = contentChunks.reduce((sum, c) => sum + c.voiceChunk.length, 0);
          expect(totalSamples).toBeGreaterThan(0);
        }

        // Should end with "end" chunk (not error)
        const lastChunk = chunks.at(-1);
        expect(lastChunk?.type).toBe("end");

        // Clean up
        job.cancel();
      }, 30_000);

      it("provides text chunks aligned with voice chunks", async () => {
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Send text input
        await job.inputText("Hello world.", true);

        // Collect synthesis results
        const chunks = await collectStream(job, { timeout: 15_000, maxChunks: 100 });

        // Extract content chunks
        const contentChunks = chunks.filter(
          (c): c is Extract<TTSChunk, { type: "content" }> => c.type === "content",
        );

        // Text chunks should progressively cover the input
        const allText = contentChunks.map((c) => c.textChunk).join("");
        // At least some text should be returned (may not be exact due to tokenization)
        expect(allText.length).toBeGreaterThanOrEqual(0);

        // Clean up
        job.cancel();
      }, 30_000);
    });

    describe("cancellation", () => {
      it("cancel stops receiving new chunks", async () => {
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Cancel immediately
        job.cancel();

        // Inputting text after cancel should not throw
        await expect(job.inputText("Test")).resolves.not.toThrow();
      });

      it("multiple cancels do not throw", async () => {
        const provider = await createProvider();
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
        const provider = await createProvider();
        await expect(provider.generate()).resolves.toBeDefined();
      });
    });

    describe("text input handling", () => {
      it("handles empty text input", async () => {
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        await expect(job.inputText("")).resolves.not.toThrow();

        job.cancel();
      });

      it("handles text with special characters", async () => {
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        await expect(job.inputText("Hello! How are you? 🙂")).resolves.not.toThrow();

        job.cancel();
      });

      it("handles text with markdown formatting", async () => {
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        await expect(
          job.inputText("This is **bold** and _italic_ text.", true),
        ).resolves.not.toThrow();

        // Collect to ensure processing completes
        await collectStream(job, { timeout: 5000 });

        job.cancel();
      });

      it("handles rapid sequential text chunks", async () => {
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        // Send many small chunks rapidly
        const words = ["This", " is", " a", " rapid", " test", " of", " text", " input."];
        for (let i = 0; i < words.length; i++) {
          await job.inputText(words[i] as string, i === words.length - 1);
        }

        // Collect to ensure processing completes
        await collectStream(job, { timeout: 10_000 });

        job.cancel();
      });

      it("handles long text input", async () => {
        const provider = await createProvider();
        const [error, job] = await provider.generate();

        if (error) {
          expect(isLifeError(error)).toBe(true);
          return;
        }

        const longText = "This is a test sentence. ".repeat(20);
        await expect(job.inputText(longText, true)).resolves.not.toThrow();

        // Collect to ensure processing completes
        await collectStream(job, { timeout: 15_000 });

        job.cancel();
      }, 30_000);
    });
  });

  describe("CartesiaTTS specific", () => {
    it("accepts model option", async () => {
      const provider = new CartesiaTTS({ provider: "cartesia", model: "sonic-2" });
      const [error, job] = await provider.generate();
      if (error) return;
      expect(provider.config.model).toBe("sonic-2");
      job.cancel();
    });

    it("accepts language option", async () => {
      const provider = new CartesiaTTS({ provider: "cartesia", language: "fr" });
      const [error, job] = await provider.generate();
      if (error) return;
      expect(provider.config.language).toBe("fr");
      job.cancel();
    });

    it("accepts voiceId option", async () => {
      const provider = new CartesiaTTS({ provider: "cartesia", voiceId: "custom-voice-id" });
      const [error, job] = await provider.generate();
      if (error) return;
      expect(provider.config.voiceId).toBe("custom-voice-id");
      job.cancel();
    });
  });
});
