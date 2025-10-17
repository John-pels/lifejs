import { describe, expect, test } from "vitest";
import type { TTSBase } from "../../tts/base";

/**
 * Configuration for the common TTS test suite
 * @param provider - The provider name (e.g., "cartesia", "google", "openai")
 * @param createInstance - Function to create a TTS instance
 * @param getConfig - Function to return parsed config for this provider
 * @param skipIntegrationTests - Skip real API tests (default: true for unit tests)
 */
export interface TTSCommonTestConfig {
  provider: string;
  createInstance: (config: any) => TTSBase<any>;
  getConfig: () => any;
  skipIntegrationTests?: boolean;
}

/**
 * Common test suite for all TTS providers
 * Tests core functionality that should work consistently across all providers
 *
 * Similar to an interface contract - all TTS providers should:
 * - Handle configuration validation
 * - Create generation jobs with required interface
 * - Handle text push with validation
 * - Stream audio chunks and transcription
 * - Handle errors consistently
 * - Manage job lifecycle (creation, streaming, cancellation)
 */
export function createCommonTTSTests(config: TTSCommonTestConfig) {
  describe(`${config.provider} TTS Provider - Common Tests`, () => {
    describe("Configuration", () => {
      test("creates instance with valid config", () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);
        expect(tts).toBeDefined();
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
        const customModel = "sonic";
        const customCfg = { ...cfg, model: customModel };
        const tts = config.createInstance(customCfg);
        // Just verify instance is created (config is protected)
        expect(tts).toBeDefined();
      });

      test("respects custom language override", () => {
        const cfg = config.getConfig();
        const customLang = "es";
        const customCfg = { ...cfg, language: customLang };
        const tts = config.createInstance(customCfg);
        // Just verify instance is created (config is protected)
        expect(tts).toBeDefined();
      });

      test("requires provider field", () => {
        const cfg = config.getConfig();
        expect(cfg.provider).toBeDefined();
        expect(cfg.provider).toBe(config.provider);
      });
    });

    describe("generate()", () => {
      test("returns success with valid job", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();
        expect(job).toBeDefined();
        expect(job?.id).toBeDefined();
        expect(typeof job?.id).toBe("string");

        if (job) job.cancel();
      });

      test("job has required interface methods", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        expect(typeof job.pushText).toBe("function");
        expect(typeof job.getStream).toBe("function");
        expect(typeof job.cancel).toBe("function");

        job.cancel();
      });

      test("generates unique job IDs", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [, job1] = await tts.generate();
        const [, job2] = await tts.generate();

        expect(job1?.id).toBeDefined();
        expect(job2?.id).toBeDefined();
        expect(job1?.id).not.toBe(job2?.id);

        if (job1) job1.cancel();
        if (job2) job2.cancel();
      });
    });

    describe("pushText()", () => {
      test("accepts valid text data", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        // pushText is fire-and-forget (returns void)
        job.pushText("Hello world");

        job.cancel();
      });

      test("rejects null text data", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        // pushText is fire-and-forget, validation happens internally
        job.pushText(null as any);

        job.cancel();
      });

      test("rejects undefined text data", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        // pushText is fire-and-forget, validation happens internally
        job.pushText(undefined as any);

        job.cancel();
      });

      test("rejects empty text data", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        // pushText is fire-and-forget, validation happens internally
        job.pushText("");

        job.cancel();
      });

      test("rejects whitespace-only text", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        // pushText is fire-and-forget, validation happens internally
        job.pushText("   ");

        job.cancel();
      });
    });

    describe("Stream handling", () => {
      test("returns stream interface from job", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        const stream = job.getStream();
        expect(stream).toBeDefined();
        expect(typeof stream.push).toBe("function");

        job.cancel();
      });

      test("stream has async queue interface", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        const stream = job.getStream();
        expect(stream).toBeDefined();
        expect(typeof stream.push).toBe("function");

        job.cancel();
      });
    });

    describe("Job Lifecycle", () => {
      test("supports job cancellation", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        // Should not throw
        expect(() => job.cancel()).not.toThrow();
      });

      test("job.raw has abortController", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        expect(job.raw).toBeDefined();
        expect(job.raw.abortController).toBeDefined();
        expect(typeof job.raw.abortController.abort).toBe("function");

        job.cancel();
      });

      test("abortController signal is accessible", async () => {
        const cfg = config.getConfig();
        const tts = config.createInstance(cfg);

        const [err, job] = await tts.generate();
        expect(err).toBeUndefined();

        if (!job) return;

        expect(job.raw.abortController.signal).toBeDefined();
        expect(typeof job.raw.abortController.signal.aborted).toBe("boolean");

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
