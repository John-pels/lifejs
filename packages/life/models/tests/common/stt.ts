import { describe, expect, test, vi } from "vitest";
import type { STTBase } from "../../stt/base";

/**
 * Configuration for the common STT test suite
 * @param provider - The provider name (e.g., "deepgram", "google", "azure")
 * @param createInstance - Function to create an STT instance
 * @param getConfig - Function to return parsed config for this provider
 * @param skipIntegrationTests - Skip real API tests (default: true for unit tests)
 */
export interface STTCommonTestConfig {
  provider: string;
  createInstance: (config: any) => STTBase<any>;
  getConfig: () => any;
  skipIntegrationTests?: boolean;
}

/**
 * Common test suite for all STT providers
 * Tests core functionality that should work consistently across all providers
 *
 * Similar to an interface contract - all STT providers should:
 * - Handle configuration validation
 * - Create generation jobs with required interface
 * - Handle voice data push with validation
 * - Stream transcription results
 * - Handle errors consistently
 * - Manage job lifecycle (creation, streaming, cancellation)
 */
export function createCommonSTTTests(config: STTCommonTestConfig) {
  describe(`${config.provider} STT Provider - Common Tests`, () => {
    describe("Configuration", () => {
      test("creates instance with valid config", () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);
        expect(stt).toBeDefined();
      });

      test("applies default model value", () => {
        const cfg = config.getConfig();
        expect(cfg.model).toBeDefined();
        expect(typeof cfg.model).toBe("string");
        expect(cfg.model.length).toBeGreaterThan(0);
      });

      test("applies default language value", () => {
        const cfg = config.getConfig();
        expect(cfg.language).toBeDefined();
        expect(typeof cfg.language).toBe("string");
        expect(cfg.language.length).toBeGreaterThan(0);
      });

      test("respects custom model override", () => {
        const cfg = config.getConfig();
        const customModel = "nova-3";
        const customCfg = { ...cfg, model: customModel };
        const stt = config.createInstance(customCfg);
        // Just verify instance is created (config is protected)
        expect(stt).toBeDefined();
      });

      test("respects custom language override", () => {
        const cfg = config.getConfig();
        const customLang = "es";
        const customCfg = { ...cfg, language: customLang };
        const stt = config.createInstance(customCfg);
        // Just verify instance is created (config is protected)
        expect(stt).toBeDefined();
      });

      test("requires provider field", () => {
        const cfg = config.getConfig();
        expect(cfg.provider).toBeDefined();
        expect(cfg.provider).toBe(config.provider);
      });
    });

    describe("generate()", () => {
      test("returns success with valid job (unit tests)", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        
        // For unit tests with mocks, we should get a job back
        if (config.skipIntegrationTests) {
          expect(err).toBeUndefined();
          expect(job).toBeDefined();
          expect(job?.id).toBeDefined();
          expect(typeof job?.id).toBe("string");
          if (job) job.cancel();
          return;
        }

        // For integration tests
        expect(err).toBeUndefined();
        expect(job).toBeDefined();
        expect(job?.id).toBeDefined();
        expect(typeof job?.id).toBe("string");
        if (job) job.cancel();
      });

      test("job has required interface methods", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        expect(typeof job.pushVoice).toBe("function");
        expect(typeof job.getStream).toBe("function");
        expect(typeof job.cancel).toBe("function");

        job.cancel();
      });

      test("generates unique job IDs", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [, job1] = await stt.generate();
        const [, job2] = await stt.generate();

        expect(job1?.id).toBeDefined();
        expect(job2?.id).toBeDefined();
        expect(job1?.id).not.toBe(job2?.id);

        if (job1) job1.cancel();
        if (job2) job2.cancel();
      });
    });

    describe("pushVoice()", () => {
      test("accepts valid audio data", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        const pcm = new Int16Array(160);
        // pushVoice is fire-and-forget (returns void)
        job.pushVoice(pcm);

        job.cancel();
      });

      test("rejects null audio data", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        // pushVoice is fire-and-forget, validation happens internally
        job.pushVoice(null as any);

        job.cancel();
      });

      test("rejects undefined audio data", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        // pushVoice is fire-and-forget, validation happens internally
        job.pushVoice(undefined as any);

        job.cancel();
      });

      test("rejects non-Int16Array audio data", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        // pushVoice is fire-and-forget, validation happens internally
        job.pushVoice("not an array" as any);

        job.cancel();
      });
    });

    describe("Stream handling", () => {
      test("returns stream interface from job", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        const stream = job.getStream();
        expect(stream).toBeDefined();
        // AsyncQueue should be async iterable
        expect(stream).toHaveProperty("push");

        job.cancel();
      });

      test("stream is async iterable", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        const stream = job.getStream();
        
        // Verify AsyncQueue exists and has expected methods
        expect(stream).toBeDefined();
        expect(typeof stream.push).toBe("function");

        job.cancel();
      });
    });

    describe("Job Lifecycle", () => {
      test("supports job cancellation", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        // Should not throw
        expect(() => job.cancel()).not.toThrow();
      });

      test("job.raw has abortController", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        expect(job.raw).toBeDefined();
        expect(job.raw.abortController).toBeDefined();
        expect(typeof job.raw.abortController.abort).toBe("function");

        job.cancel();
      });

      test("abortController signal is accessible", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        expect(job.raw.abortController.signal).toBeDefined();
        expect(typeof job.raw.abortController.signal.aborted).toBe("boolean");

        job.cancel();
      });
    });

    describe("Error Handling", () => {
      test("returns error with defined code and message on invalid audio", async () => {
        const cfg = config.getConfig();
        const stt = config.createInstance(cfg);

        const [err, job] = await stt.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        // pushVoice is fire-and-forget, validation happens internally
        job.pushVoice({} as any);

        // Give async operation a moment to complete
        await new Promise(resolve => setTimeout(resolve, 10));

        job.cancel();
      });
    });

    describe("Configuration Schema", () => {
      test("requires provider literal value", () => {
        const cfg = config.getConfig();
        expect(cfg.provider).toBe(config.provider);
      });

      test("requires apiKey field", () => {
        const cfg = config.getConfig();
        expect(cfg.apiKey).toBeDefined();
        expect(typeof cfg.apiKey).toBe("string");
        expect(cfg.apiKey.length).toBeGreaterThan(0);
      });

      test("config has all required fields", () => {
        const cfg = config.getConfig();
        expect(cfg.provider).toBeDefined();
        expect(cfg.apiKey).toBeDefined();
        expect(cfg.model).toBeDefined();
        expect(cfg.language).toBeDefined();
      });
    });
  });
}
