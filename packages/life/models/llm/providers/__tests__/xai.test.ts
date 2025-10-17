import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";

// Mock at module level
vi.mock("openai");

import { OpenAI } from "openai";
import { XaiLLM, xaiLLMConfig } from "../xai";
import { createCommonLLMTests } from "../../../tests/common/llm";

const MockedOpenAI = vi.mocked(OpenAI);

beforeEach(() => {
  vi.clearAllMocks();
});

// Run common tests for XAI provider (unit tests with mocks)
createCommonLLMTests({
  provider: "xai",
  createInstance: (config) => new XaiLLM(config),
  getConfig: () =>
    xaiLLMConfig.schema.parse({
      provider: "xai",
      apiKey: "test-key",
      model: "grok-3-mini",
    }),
  skipIntegrationTests: true, // Skip integration tests for unit tests
});

// Provider-specific tests
describe("XaiLLM - Specific Tests", () => {
  describe("Configuration Defaults", () => {
    test("sets model default to grok-3-mini", () => {
      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
      });
      expect(cfg.model).toBe("grok-3-mini");
    });

    test("sets temperature default to 0.5", () => {
      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
      });
      expect(cfg.temperature).toBe(0.5);
    });

    test("allows temperature range from 0 to 2", () => {
      const testValues = [0, 0.5, 1, 1.5, 2];
      testValues.forEach((temp) => {
        const cfg = xaiLLMConfig.schema.parse({
          provider: "xai",
          apiKey: "test-key",
          temperature: temp,
        });
        expect(cfg.temperature).toBe(temp);
      });
    });

    test("supports Grok 3 models", () => {
      const models = ["grok-3", "grok-3-fast", "grok-3-mini", "grok-3-mini-fast"];
      models.forEach((model) => {
        const cfg = xaiLLMConfig.schema.parse({
          provider: "xai",
          apiKey: "test-key",
          model,
        });
        expect(cfg.model).toBe(model);
      });
    });

    test("supports Grok 2 models", () => {
      const models = ["grok-2-1212", "grok-2-vision-1212"];
      models.forEach((model) => {
        const cfg = xaiLLMConfig.schema.parse({
          provider: "xai",
          apiKey: "test-key",
          model,
        });
        expect(cfg.model).toBe(model);
      });
    });

    test("supports beta Grok models", () => {
      const models = ["grok-beta", "grok-vision-beta"];
      models.forEach((model) => {
        const cfg = xaiLLMConfig.schema.parse({
          provider: "xai",
          apiKey: "test-key",
          model,
        });
        expect(cfg.model).toBe(model);
      });
    });

    test("requires apiKey field", () => {
      expect(() => {
        xaiLLMConfig.schema.parse({
          provider: "xai",
        });
      }).toThrow();
    });

    test("requires provider literal value 'xai'", () => {
      expect(() => {
        xaiLLMConfig.schema.parse({
          provider: "openai",
          apiKey: "test-key",
        });
      }).toThrow();
    });

    test("throws error when no API key provided", () => {
      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        model: "grok-3-mini",
      });
      expect(() => new XaiLLM(cfg)).toThrow(/XAI_API_KEY/);
    });
  });

  describe("Client Configuration", () => {
    test("sets base URL to X.ai API endpoint", () => {
      const mockImplementation = vi.fn();
      MockedOpenAI.mockImplementation(mockImplementation as any);

      new XaiLLM({
        provider: "xai",
        apiKey: "test-key",
        model: "grok-3-mini",
      });

      expect(mockImplementation).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: "test-key",
          baseURL: "https://api.x.ai/v1",
        }),
      );
    });
  });

  describe("generateObject() - Unit Tests", () => {
    test("returns success with valid JSON response", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ ok: true, s: "x" }) } }],
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

      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
        model: "grok-3-mini",
      });
      const llm = new XaiLLM(cfg);
      const schema = z.object({ ok: z.boolean(), s: z.string() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(err).toBeUndefined();
      expect(res).toEqual({ ok: true, s: "x" });
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

      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
        model: "grok-3-mini",
      });
      const llm = new XaiLLM(cfg);
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

      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
        model: "grok-3-mini",
      });
      const llm = new XaiLLM(cfg);
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

      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
        model: "grok-3-mini",
      });
      const llm = new XaiLLM(cfg);
      const schema = z.object({ ok: z.boolean() });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(res).toBeUndefined();
      expect(err?.code).toBe("Upstream");
      expect(err?.message).toBe("Invalid response format from X.ai API");
    });

    test("handles complex nested schemas", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                data: { nested: { value: true } },
                items: [1, 2, 3],
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

      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
        model: "grok-3-mini",
      });
      const llm = new XaiLLM(cfg);
      const schema = z.object({
        data: z.object({ nested: z.object({ value: z.boolean() }) }),
        items: z.array(z.number()),
      });

      const [err, res] = await llm.generateObject({ messages: [], schema });
      expect(err).toBeUndefined();
      expect(res).toEqual({
        data: { nested: { value: true } },
        items: [1, 2, 3],
      });
    });
  });

  describe("generateMessage() - Unit Tests", () => {
    test("includes json_object response format in generateObject", async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
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

      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
        model: "grok-3-mini",
      });
      const llm = new XaiLLM(cfg);
      const schema = z.object({ ok: z.boolean() });

      await llm.generateObject({ messages: [], schema });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: "json_object" },
        }),
      );
    });

    test("handles streaming with empty tools array", async () => {
      const contentChunks = [
        { choices: [{ delta: { content: "test" }, finish_reason: "stop" }] },
      ];

      const mockCreate = vi.fn().mockResolvedValue({
        [Symbol.asyncIterator]() {
          let i = 0;
          return {
            async next() {
              if (i >= contentChunks.length) return { done: true, value: undefined };
              return { done: false, value: contentChunks[i++] };
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

      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
        model: "grok-3-mini",
      });
      const llm = new XaiLLM(cfg);

      await llm.generateMessage({ messages: [], tools: [] });

      // Should NOT include tools parameter when empty
      expect(mockCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({
          tools: expect.anything(),
        }),
        expect.any(Object),
      );
    });
  });

  describe("LLM Instance Properties", () => {
    test("stores configuration on instance", () => {
      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
        model: "grok-3",
        temperature: 0.7,
      });
      const llm = new XaiLLM(cfg);

      expect(llm.config.provider).toBe("xai");
      expect(llm.config.model).toBe("grok-3");
      expect(llm.config.temperature).toBe(0.7);
    });
  });

  describe("OpenAI Compatibility", () => {
    test("uses OpenAI client with custom baseURL for X.ai", () => {
      MockedOpenAI.mockImplementation(
        () =>
          ({
            chat: {
              completions: {
                create: vi.fn().mockResolvedValue({
                  choices: [{ message: { content: JSON.stringify({ ok: true }) } }],
                }),
              },
            },
          }) as any,
      );

      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
      });

      new XaiLLM(cfg);

      expect(MockedOpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: "https://api.x.ai/v1",
        }),
      );
    });

    test("converts ToolDefinition to OpenAI format", async () => {
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

      const cfg = xaiLLMConfig.schema.parse({
        provider: "xai",
        apiKey: "test-key",
      });
      const llm = new XaiLLM(cfg);

      await llm.generateMessage({
        messages: [],
        tools: [
          {
            name: "test",
            description: "test tool",
            schema: {
              input: z.object({ param: z.string() }),
              output: z.object({ result: z.string() }),
            },
            run: () => ({ success: true, output: { result: "ok" } }),
          },
        ],
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              type: "function",
              function: expect.objectContaining({
                name: "test",
                description: "test tool",
              }),
            }),
          ]),
        }),
        expect.any(Object),
      );
    });
  });
});
