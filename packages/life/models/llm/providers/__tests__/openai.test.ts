import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

// Mock at module level
vi.mock("openai");

import { OpenAI } from "openai";
import { OpenAILLM, openAILLMConfig } from "../openai";
import { createCommonLLMTests } from "../../../tests/common/llm";

const MockedOpenAI = vi.mocked(OpenAI);

beforeEach(() => {
  vi.clearAllMocks();
});

// Run common tests for OpenAI provider (unit tests with mocks)
createCommonLLMTests({
  provider: "openai",
  createInstance: (config) => new OpenAILLM(config),
  getConfig: () =>
    openAILLMConfig.schema.parse({
      provider: "openai",
      apiKey: process.env.OPENAI_API_KEY  || "test-key",
      model: "gpt-4o-mini",
    }),
  skipIntegrationTests: true, // Skip integration tests for unit tests
});

// Provider-specific tests
describe("OpenAILLM - Specific Tests", () => {
  describe("Configuration Defaults", () => {
    test("sets model default to gpt-4o-mini", () => {
      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY || "test-key",
      });
      expect(cfg.model).toBe("gpt-4o-mini");
    });

    test("sets temperature default to 0.5", () => {
      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY || "test-key",
      });
      expect(cfg.temperature).toBe(0.5);
    });

    test("allows temperature range from 0 to 2", () => {
      const testValues = [0, 0.5, 1, 1.5, 2];
      testValues.forEach((temp) => {
        const cfg = openAILLMConfig.schema.parse({
          provider: "openai",
          apiKey: process.env.OPENAI_API_KEY || "test-key",
          temperature: temp,
        });
        expect(cfg.temperature).toBe(temp);
      });
    });

    test("supports gpt-4o and gpt-4o-mini models", () => {
      const models = ["gpt-4o", "gpt-4o-mini"];
      models.forEach((model) => {
        const cfg = openAILLMConfig.schema.parse({
          provider: "openai",
          apiKey: process.env.OPENAI_API_KEY || "test-key",
          model,
        });
        expect(cfg.model).toBe(model);
      });
    });

    test("requires apiKey field", () => {
      expect(() => {
        openAILLMConfig.schema.parse({
          provider: "openai",
        });
      }).toThrow();
    });

    test("requires provider literal value 'openai'", () => {
      expect(() => {
        openAILLMConfig.schema.parse({
          provider: "mistral",
          apiKey: process.env.OPENAI_API_KEY || "test-key",
        });
      }).toThrow();
    });
  });

  describe("generateObject() - Unit Tests", () => {
    test("returns success with valid JSON response", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ ok: true, n: 1 }) } }],
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any,
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY || "test-key",
        model: "gpt-4o-mini",
      });
      const llm = new OpenAILLM(cfg);
      const schema = z.object({ ok: z.boolean(), n: z.number() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(err).toBeUndefined();
      expect(res).toEqual({ ok: true, n: 1 });
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
        }),
      );
    });

    test("returns validation failure for invalid JSON", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: "invalid json" } }],
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any,
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY || "test-key",
      });
      const llm = new OpenAILLM(cfg);
      const schema = z.object({ ok: z.boolean() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(res).toBeUndefined();
      expect(err?.code).toBe("Validation");
      expect(err?.message).toMatch(/Failed to parse response as JSON/);
    });

    test("returns validation failure for schema mismatch", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ notOk: "wrong" }) } }],
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any,
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY || "test-key",
      });
      const llm = new OpenAILLM(cfg);
      const schema = z.object({ ok: z.boolean(), required: z.string() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(res).toBeUndefined();
      expect(err?.code).toBe("Validation");
      expect(err?.message).toMatch(/Schema validation failed/);
    });

    test("returns Upstream error for missing response content", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: {} }],
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any,
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY || "test-key",
      });
      const llm = new OpenAILLM(cfg);
      const schema = z.object({ ok: z.boolean() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(res).toBeUndefined();
      expect(err?.code).toBe("Upstream");
      expect(err?.message).toBe("Invalid response format from OpenAI API");
    });

    test("handles complex nested schemas", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                user: { name: "John", age: 30 },
                tags: ["developer", "engineer"],
              }),
            },
          },
        ],
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any,
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY || "test-key",
      });
      const llm = new OpenAILLM(cfg);
      const schema = z.object({
        user: z.object({ name: z.string(), age: z.number() }),
        tags: z.array(z.string()),
      });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(err).toBeUndefined();
      expect(res).toEqual({
        user: { name: "John", age: 30 },
        tags: ["developer", "engineer"],
      });
    });
  });

  describe("generateMessage() - Unit Tests", () => {
    test("includes stream parameter in API call", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]() {
          return {
            async next() {
              return { done: true, value: undefined };
            },
          };
        },
      });

      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: mockCreate,
              },
            },
          }) as any,
      );

      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY || "test-key",
      });
      const llm = new OpenAILLM(cfg);

      await llm.generateMessage({ messages: [], tools: [] });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          stream: true,
        }),
        expect.any(Object),
      );
    });
  });

  describe("LLM Instance Properties", () => {
    test("stores configuration on instance", () => {
      const cfg = openAILLMConfig.schema.parse({
        provider: "openai",
        apiKey: process.env.OPENAI_API_KEY || "test-key",
        model: "gpt-4o",
        temperature: 0.7,
      });
      const llm = new OpenAILLM(cfg);

      expect(llm.config.provider).toBe("openai");
      expect(llm.config.model).toBe("gpt-4o");
      expect(llm.config.temperature).toBe(0.7);
    });
  });
});
