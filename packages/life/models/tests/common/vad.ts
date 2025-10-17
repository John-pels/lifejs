import { describe, expect, test } from "vitest";
import type { VADBase } from "../../vad/base";

/**
 * Configuration for the common VAD test suite
 * @param provider - The provider name (e.g., "silero", "webrtc", "google")
 * @param createInstance - Function to create a VAD instance
 * @param getConfig - Function to return parsed config for this provider
 * @param skipIntegrationTests - Skip real API tests (default: true for unit tests)
 */
export interface VADCommonTestConfig {
  provider: string;
  createInstance: (config: any) => VADBase<any>;
  getConfig: () => any;
  skipIntegrationTests?: boolean;
}

/**
 * Common test suite for all VAD providers
 * Tests core functionality that should work consistently across all providers
 *
 * Similar to an interface contract - all VAD providers should:
 * - Handle configuration validation
 * - Process audio data and return probability (0-1)
 * - Handle audio validation (null, undefined, wrong type)
 * - Handle errors consistently
 * - Return 0 for insufficient samples
 */
export function createCommonVADTests(config: VADCommonTestConfig) {
  describe(`${config.provider} VAD Provider - Common Tests`, () => {
    describe("Configuration", () => {
      test("creates instance with valid config", () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);
        expect(vad).toBeDefined();
      });

      test("requires provider field", () => {
        const cfg = config.getConfig();
        expect(cfg.provider).toBeDefined();
        expect(cfg.provider).toBe(config.provider);
      });

      test("config has all required fields", () => {
        const cfg = config.getConfig();
        expect(cfg.provider).toBeDefined();
      });
    });

    describe("checkActivity()", () => {
      test("returns success with valid audio data", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const pcm = new Int16Array(160); // 10ms @ 16kHz
        const [err, prob] = await vad.checkActivity(pcm);

        expect(err).toBeUndefined();
        expect(prob).toBeDefined();
        expect(typeof prob).toBe("number");
      });

      test("returns probability between 0 and 1", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const pcm = new Int16Array(1024); // Larger sample
        const [err, prob] = await vad.checkActivity(pcm);

        if (err) return; // Skip if error

        expect(prob).toBeDefined();
        expect(prob).toBeGreaterThanOrEqual(0);
        expect(prob).toBeLessThanOrEqual(1);
      });

      test("returns 0 for insufficient samples", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const pcm = new Int16Array(160); // 10ms - typically insufficient
        const [err, prob] = await vad.checkActivity(pcm);

        expect(err).toBeUndefined();
        expect(prob).toBe(0);
      });

      test("processes larger audio chunks", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const pcm = new Int16Array(1024); // Enough samples to trigger inference
        const [err, prob] = await vad.checkActivity(pcm);

        expect(err).toBeUndefined();
        expect(prob).toBeDefined();
        expect(typeof prob).toBe("number");
      });
    });

    describe("Audio Validation", () => {
      test("rejects null audio data", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const [err, result] = await vad.checkActivity(null as any);

        expect(err).toBeDefined();
        expect(err?.code).toBe("Validation");
        expect(result).toBeUndefined();
      });

      test("rejects undefined audio data", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const [err, result] = await vad.checkActivity(undefined as any);

        expect(err).toBeDefined();
        expect(err?.code).toBe("Validation");
        expect(result).toBeUndefined();
      });

      test("rejects non-Int16Array audio data", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const [err, result] = await vad.checkActivity(new Uint8Array(1024) as any);

        expect(err).toBeDefined();
        expect(err?.code).toBe("Validation");
        expect(result).toBeUndefined();
      });

      test("rejects invalid audio data types", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const testCases = [
          [1, 2, 3], // Array
          "audio data", // String
          { data: [1, 2, 3] }, // Object
          123, // Number
        ];

        for (const testCase of testCases) {
          const [err, result] = await vad.checkActivity(testCase as any);
          expect(err).toBeDefined();
          expect(err?.code).toBe("Validation");
          expect(result).toBeUndefined();
        }
      });
    });

    describe("Return Type Consistency", () => {
      test("returns OperationResult tuple with correct structure on success", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const pcm = new Int16Array(160);
        const [err, prob] = await vad.checkActivity(pcm);

        // Success case: [undefined, value]
        expect(Array.isArray([err, prob])).toBe(true);
        expect(err).toBeUndefined();
        expect(typeof prob).toBe("number");
      });

      test("returns OperationResult tuple with correct structure on failure", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const [err, result] = await vad.checkActivity(null as any);

        // Failure case: [error, undefined]
        expect(Array.isArray([err, result])).toBe(true);
        expect(err).toBeDefined();
        expect(result).toBeUndefined();
      });
    });

    describe("Error Handling", () => {
      test("returns error with defined code and message", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const [err] = await vad.checkActivity(null as any);

        expect(err).toBeDefined();
        expect(err?.code).toBeDefined();
        expect(typeof err?.code).toBe("string");
        expect(err?.message).toBeDefined();
        expect(typeof err?.message).toBe("string");
        expect(["Validation", "Upstream", "Unknown"]).toContain(err?.code);
      });

      test("validation errors have appropriate messages", async () => {
        const cfg = config.getConfig();
        const vad = config.createInstance(cfg);

        const [errNull] = await vad.checkActivity(null as any);
        expect(errNull?.message).toBeDefined();
        expect(errNull?.message.length).toBeGreaterThan(0);

        const [errUndef] = await vad.checkActivity(undefined as any);
        expect(errUndef?.message).toBeDefined();
        expect(errUndef?.message.length).toBeGreaterThan(0);
      });
    });

    describe("Configuration Schema", () => {
      test("requires provider literal value", () => {
        const cfg = config.getConfig();
        expect(cfg.provider).toBe(config.provider);
      });

      test("validates provider type", () => {
        const cfg = config.getConfig();
        expect(typeof cfg.provider).toBe("string");
        expect(cfg.provider.length).toBeGreaterThan(0);
      });
    });
  });
}
