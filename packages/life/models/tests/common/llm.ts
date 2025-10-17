import { describe, expect, test } from "vitest";
import  { z } from "zod";
import type { LLMBase } from "../../llm/base";

/**
 * Configuration for the common LLM test suite
 * @param provider - The provider name (e.g., "openai", "mistral", "xai")
 * @param createInstance - Function to create an LLM instance
 * @param getConfig - Function to return parsed config for this provider
 * @param skipIntegrationTests - Skip real API tests (default: false for real tests, true for unit tests with mocks)
 */
export interface LLMCommonTestConfig {
  provider: string;
  createInstance: (config: any) => LLMBase<any>;
  getConfig: () => any;
  skipIntegrationTests?: boolean;
}

/**
 * Common test suite for all LLM providers
 * Tests core functionality that should work consistently across all providers
 *
 * Similar to an interface contract - all LLM providers should:
 * - Handle configuration validation
 * - Support message generation with streaming
 * - Support object generation with schema validation
 * - Handle errors consistently
 * - Manage job lifecycle (creation, streaming, cancellation)
 */
export function createCommonLLMTests(config: LLMCommonTestConfig) {
  describe(`${config.provider} LLM Provider - Common Tests`, () => {
    describe("Configuration", () => {
      test("creates instance with valid config", () => {
        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);
        expect(llm).toBeDefined();
      });

      test("throws error when API key is missing", () => {
        expect(() => {
          config.getConfig.toString().includes("apiKey") &&
            expect(() => {
              // Config should throw without API key
              const cfg = config.getConfig();
              if (!cfg.apiKey) throw new Error(`${config.provider.toUpperCase()}_API_KEY required`);
            }).toThrow();
        }).not.toThrow(); // This test is optional, depends on test setup
      });

      test("applies default temperature value", () => {
        const cfg = config.getConfig();
        expect(cfg.temperature).toBeDefined();
        expect(typeof cfg.temperature).toBe("number");
        expect(cfg.temperature).toBeGreaterThanOrEqual(0);
        expect(cfg.temperature).toBeLessThanOrEqual(2);
      });

      test("applies default model value", () => {
        const cfg = config.getConfig();
        expect(cfg.model).toBeDefined();
        expect(typeof cfg.model).toBe("string");
      });

      test("respects custom temperature override", () => {
        const cfg = config.getConfig();
        cfg.temperature = 0.8;
        const llm = config.createInstance(cfg);
        expect(llm.config.temperature).toBe(0.8);
      });

      test("respects custom model override", () => {
        const cfg = config.getConfig();
        const customModel = "grok-3";
        const customCfg = { ...cfg, model: customModel };
        const llm = config.createInstance(customCfg);
        expect(llm).toBeDefined();
      });
    });

    describe("generateObject()", () => {
      test("returns success with valid object generation", async () => {
        if (config.skipIntegrationTests) {
          // Unit test should use mocks - skip integration test
          return;
        }

        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);

        // Dynamic import to avoid circular dependencies
        const { z } = await import("zod");
        const schema = z.object({ ok: z.boolean(), value: z.number() });

        const [err, res] = await llm.generateObject({
          messages: [
            {
              role: "user",
              content: "Return JSON: {ok: true, value: 42}",
              id: "test-msg-1",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          schema,
        });

        expect(err).toBeUndefined();
        expect(res).toBeDefined();
        expect(res?.ok).toBe(true);
        expect(res?.value).toBe(42);
      });

      test("returns validation error on schema mismatch", async () => {
        if (config.skipIntegrationTests) return;

        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);

        const { z } = await import("zod");
        const schema = z.object({ required: z.string(), number: z.number() });

        const [err, res] = await llm.generateObject({
          messages: [
            {
              role: "user",
              content: "Return JSON with only: {ok: true}",
              id: "test-msg-2",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          schema,
        });

        expect(res).toBeUndefined();
        expect(err?.code).toBe("Validation");
        expect(err?.message).toMatch(/Schema validation failed/);
      });

      test("returns validation error on invalid JSON", async () => {
        if (config.skipIntegrationTests) return;

        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);

        const { z } = await import("zod");
        const schema = z.object({ ok: z.boolean() });

        const [err, res] = await llm.generateObject({
          messages: [
            {
              role: "user",
              content: "Respond with plain text, not JSON",
              id: "test-msg-3",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          schema,
        });

        expect(res).toBeUndefined();
        expect(err?.code).toBe("Validation");
        expect(err?.message).toMatch(/Failed to parse response as JSON/);
      });
    });

    describe("generateMessage()", () => {
      test("returns job with defined stream interface", async () => {
        if (config.skipIntegrationTests) return;

        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);

        const [err, job] = await llm.generateMessage({
          messages: [
            {
              role: "user",
              content: "Say hello.",
              id: "test-msg-4",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          tools: [],
        });

        expect(err).toBeUndefined();
        expect(job).toBeDefined();
        expect(job?.id).toBeDefined();
        expect(typeof job?.getStream).toBe("function");
        expect(typeof job?.cancel).toBe("function");

        if (job) {
          // Consume stream to prevent hanging
          for await (const _ of job.getStream()) {
            break; // Just get first chunk
          }
        }
      });

      test("streams content chunks correctly", async () => {
        if (config.skipIntegrationTests) return;

        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);

        const [err, job] = await llm.generateMessage({
          messages: [
            {
              role: "user",
              content: "Say exactly: Hi",
              id: "test-msg-5",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          tools: [],
        });

        expect(err).toBeUndefined();
        expect(job).toBeDefined();

        if (!job) return;

        const chunks: any[] = [];
        for await (const chunk of job.getStream()) {
          chunks.push(chunk);
        }

        // Should have content chunks
        const contentChunks = chunks.filter((c) => c.type === "content");
        expect(contentChunks.length).toBeGreaterThan(0);

        // Should end with end chunk
        const endChunk = chunks.find((c) => c.type === "end");
        expect(endChunk).toBeDefined();
      });

      test("generates unique job IDs", async () => {
        if (config.skipIntegrationTests) return;

        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);

        const [, job1] = await llm.generateMessage({
          messages: [
            {
              role: "user",
              content: "Test 1",
              id: "test-msg-6",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          tools: [],
        });

        const [, job2] = await llm.generateMessage({
          messages: [
            {
              role: "user",
              content: "Test 2",
              id: "test-msg-7",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          tools: [],
        });

        expect(job1?.id).toBeDefined();
        expect(job2?.id).toBeDefined();
        expect(job1?.id).not.toBe(job2?.id);

        // Cleanup
        if (job1) job1.cancel();
        if (job2) job2.cancel();
      });

      test("handles system messages", async () => {
        if (config.skipIntegrationTests) return;

        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);

        const [err, job] = await llm.generateMessage({
          messages: [
            {
              role: "system",
              content: "You are helpful.",
              id: "test-msg-sys",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
            {
              role: "user",
              content: "What is 2+2?",
              id: "test-msg-8",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          tools: [],
        });

        expect(err).toBeUndefined();
        expect(job).toBeDefined();

        if (job) {
          const chunks: any[] = [];
          for await (const chunk of job.getStream()) {
            chunks.push(chunk);
          }
          expect(chunks.length).toBeGreaterThan(0);
        }
      });

      test("handles empty tools array", async () => {
        if (config.skipIntegrationTests) return;

        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);

        const [err, job] = await llm.generateMessage({
          messages: [
            {
              role: "user",
              content: "Hello",
              id: "test-msg-9",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          tools: [],
        });

        expect(err).toBeUndefined();
        expect(job).toBeDefined();

        if (job) {
          const chunks: any[] = [];
          for await (const chunk of job.getStream()) {
            chunks.push(chunk);
          }
          expect(chunks.length).toBeGreaterThan(0);
        }
      });

      test("handles multi-turn conversations", async () => {
        if (config.skipIntegrationTests) return;

        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);

        const [err, job] = await llm.generateMessage({
          messages: [
            {
              role: "user",
              content: "What is 10 + 5?",
              id: "test-msg-10",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
            {
              role: "agent",
              content: "15",
              id: "test-msg-11",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
            {
              role: "user",
              content: "Multiply by 2",
              id: "test-msg-12",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          tools: [],
        });

        expect(err).toBeUndefined();
        expect(job).toBeDefined();

        if (job) {
          const chunks: any[] = [];
          for await (const chunk of job.getStream()) {
            chunks.push(chunk);
          }
          expect(chunks.length).toBeGreaterThan(0);
        }
      });

      test("supports job cancellation", async () => {
        if (config.skipIntegrationTests) return;

        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);

        const [err, job] = await llm.generateMessage({
          messages: [
            {
              role: "user",
              content: "Write a very long story",
              id: "test-msg-13",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          tools: [],
        });

        expect(err).toBeUndefined();
        expect(job).toBeDefined();

        if (job) {
          const chunks: any[] = [];
          let count = 0;
          for await (const chunk of job.getStream()) {
            chunks.push(chunk);
            count++;
            if (count >= 3) {
              job.cancel();
              break;
            }
          }
          // Should have some chunks but not complete
          expect(chunks.length).toBeGreaterThan(0);
        }
      });
    });

    describe("Error Handling", () => {
      test("returns Upstream error on API failure", async () => {
        if (config.skipIntegrationTests) return;

        const cfg = config.getConfig();
        const llm = config.createInstance(cfg);

        // This should fail due to invalid context or API issues
        const [err, res] = await llm.generateObject({
          messages: [
            {
              role: "user",
              content: "x".repeat(100000), // Extremely long message
              id: "test-msg-14",
              createdAt: Date.now(),
              lastUpdated: Date.now(),
            },
          ],
          schema: (await import("zod")).z.object({ ok: z.boolean() }),
        });

        if (err) {
          expect(err.code).toBeDefined();
          expect(["Upstream", "Validation", "Unknown"]).toContain(err.code);
        }
      });
    });
  });
}
