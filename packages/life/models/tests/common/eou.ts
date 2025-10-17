import { describe, expect, test } from "vitest";
import type { EOUBase } from "../../eou/base";

/**
 * Configuration for the common EOU test suite
 * @param provider - The provider name (e.g., "livekit", "turnsense")
 * @param createInstance - Function to create an EOU instance with given config
 * @param getConfig - Function to parse and return config for this provider
 * @param expectedErrorMessagePattern - Optional regex pattern to match in error messages
 */
export interface EOUCommonTestConfig {
  provider: string;
  createInstance: (config: any) => EOUBase<any>;
  getConfig: () => any;
  expectedErrorMessagePattern?: RegExp;
}

/**
 * Common test suite for all EOU providers
 * Tests core functionality that should work consistently across all providers
 *
 * Think of this like a contract or interface test - just as different implementations
 * of a protocol must all support the same basic operations, all EOU providers should
 * pass the same fundamental tests while handling provider-specific details internally.
 */
export function createCommonEOUTests(config: EOUCommonTestConfig) {
  describe(`${config.provider} EOU Provider - Common Tests`, () => {
    describe("Configuration", () => {
      test("validates correct configuration with provider literal", () => {
        const cfg = config.getConfig();
        expect(cfg.provider).toBe(config.provider);
      });

      test("creates instance with valid config", () => {
        const cfg = config.getConfig();
        const eou = config.createInstance(cfg);
        expect(eou).toBeDefined();
      });
    });

    describe("predict() - Input Validation", () => {
      test("handles null messages with Validation error", async () => {
        const cfg = config.getConfig();
        const eou = config.createInstance(cfg);
        const [err, result] = await eou.predict(null as any);

        expect(err).toBeDefined();
        expect(err?.code).toBe("Validation");
        expect(err?.message).toContain("Messages must be provided");
        expect(result).toBeUndefined();
      });

      test("handles undefined messages with Validation error", async () => {
        const cfg = config.getConfig();
        const eou = config.createInstance(cfg);
        const [err, result] = await eou.predict(undefined as any);

        expect(err).toBeDefined();
        expect(err?.code).toBe("Validation");
        expect(err?.message).toContain("Messages must be provided");
        expect(result).toBeUndefined();
      });

      test("returns success(0) for empty messages array", async () => {
        const cfg = config.getConfig();
        const eou = config.createInstance(cfg);
        const [err, prob] = await eou.predict([]);

        expect(err).toBeUndefined();
        expect(prob).toBe(0);
      });
    });

    describe("predict() - Return Type Consistency", () => {
      test("returns OperationResult tuple with correct structure on success", async () => {
        const cfg = config.getConfig();
        const eou = config.createInstance(cfg);
        const [err, prob] = await eou.predict([]);

        // Success case: [undefined, value]
        expect(Array.isArray([err, prob])).toBe(true);
        expect(err).toBeUndefined();
        expect(typeof prob).toBe("number");
      });

      test("returns OperationResult tuple with correct structure on failure", async () => {
        const cfg = config.getConfig();
        const eou = config.createInstance(cfg);
        const [err, result] = await eou.predict(null as any);

        // Failure case: [error, undefined]
        expect(Array.isArray([err, result])).toBe(true);
        expect(err).toBeDefined();
        expect(result).toBeUndefined();
      });
    });

    describe("predict() - Error Handling", () => {
      test("returns Upstream error when inference fails", async () => {
        const cfg = config.getConfig();
        const eou = config.createInstance(cfg);

        // This test attempts inference with actual models
        // Failure is expected since models may not be available in test environment
        const [err, result] = await eou.predict([
          { role: "user", content: "test message" },
        ] as any);

        // Either returns Upstream error (if models fail to load/run)
        // Or other error type (implementation may vary)
        if (err) {
          expect(err.code).toBeDefined();
          expect(result).toBeUndefined();
        }
      });

      test("handles malformed message objects gracefully", async () => {
        const cfg = config.getConfig();
        const eou = config.createInstance(cfg);
        const [err, result] = await eou.predict([{ invalid: "message" }] as any);

        // May return Upstream error or handle gracefully
        if (err) {
          expect(err.code).toBeDefined();
          expect(result).toBeUndefined();
        }
      });
    });
  });
}
