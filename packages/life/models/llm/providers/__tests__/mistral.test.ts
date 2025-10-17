import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { MistralLLM, mistralLLMConfig } from "../mistral";
import { createCommonLLMTests } from "../../../tests/common/llm";

const API_KEY_REGEX = /MISTRAL_API_KEY/;
const TIMEOUT = 30_000;

beforeEach(() => {
  vi.clearAllMocks();
});

// Run common tests for Mistral provider (integration tests with real API)
createCommonLLMTests({
  provider: "mistral",
  createInstance: (config) => new MistralLLM(config),
  getConfig: () =>
    mistralLLMConfig.schema.parse({
      provider: "mistral",
      apiKey: process.env.MISTRAL_API_KEY,
      model: "mistral-large-2407",
    }),
  skipIntegrationTests: false, // Run integration tests
});

// Provider-specific tests
describe("MistralLLM - Specific Tests", () => {
  describe("Configuration Defaults", () => {
    test("sets model default to mistral-small-latest", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
      });
      expect(cfg.model).toBe("mistral-small-latest");
    });

    test("sets temperature default to 0.5", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
      });
      expect(cfg.temperature).toBe(0.5);
    });

    test("allows temperature range from 0 to 1", () => {
      const testValues = [0, 0.25, 0.5, 0.75, 1];
      testValues.forEach((temp) => {
        const cfg = mistralLLMConfig.schema.parse({
          provider: "mistral",
          apiKey: "test-key",
          temperature: temp,
        });
        expect(cfg.temperature).toBe(temp);
      });
    });

    test("supports multiple Mistral models", () => {
      const models = [
        "mistral-large-latest",
        "mistral-small-latest",
        "mistral-medium-latest",
      ];
      models.forEach((model) => {
        const cfg = mistralLLMConfig.schema.parse({
          provider: "mistral",
          apiKey: "test-key",
          model,
        });
        expect(cfg.model).toBe(model);
      });
    });

    test("supports Pixtral vision models", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
        model: "pixtral-large-latest",
      });
      expect(cfg.model).toBe("pixtral-large-latest");
    });

    test("supports Codestral code models", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
        model: "codestral-latest",
      });
      expect(cfg.model).toBe("codestral-latest");
    });

    test("requires apiKey field", () => {
      expect(() => {
        mistralLLMConfig.schema.parse({
          provider: "mistral",
        });
      }).toThrow();
    });

    test("requires provider literal value 'mistral'", () => {
      expect(() => {
        mistralLLMConfig.schema.parse({
          provider: "openai",
          apiKey: "test-key",
        });
      }).toThrow();
    });

    test("throws error when no API key provided", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        model: "mistral-small-latest",
      });
      expect(() => new MistralLLM(cfg)).toThrow(API_KEY_REGEX);
    });

    test("successfully creates instance with API key", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
      });
      expect(() => new MistralLLM(cfg)).not.toThrow();
    });

    test("applies default values from config schema", () => {
      const llm = new MistralLLM({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY || "test-key",
      });
      expect(llm.config.model).toBe("mistral-small-latest");
      expect(llm.config.temperature).toBe(0.5);
    });

    test("respects custom temperature and model values", () => {
      const llm = new MistralLLM({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY || "test-key",
        model: "mistral-large-latest",
        temperature: 0.8,
      });
      expect(llm.config.model).toBe("mistral-large-latest");
      expect(llm.config.temperature).toBe(0.8);
    });
  });

  describe("generateObject() - Integration Tests", () => {
    test("returns success with valid JSON response", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({ answer: z.number() });

      const [err, res] = await llm.generateObject({
        messages: [
          {
            role: "user",
            content: "What is 2 + 2? Respond with a JSON object containing an 'answer' field with the number.",
            id: "test-msg-1",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        schema,
      });

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      if (res) {
        expect(res.answer).toBe(4);
      }
    }, TIMEOUT);

    test("returns validation failure for schema mismatch", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({ answer: z.string(), extra: z.number() });

      const [err, res] = await llm.generateObject({
        messages: [
          {
            role: "user",
            content: "What is 2 + 2? Respond with a JSON object containing only an 'answer' field with the boolean true.",
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
    }, TIMEOUT);

    test("handles complex nested schemas", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({
        user: z.object({
          name: z.string(),
          age: z.number(),
        }),
        tags: z.array(z.string()),
      });

      const [err, res] = await llm.generateObject({
        messages: [
          {
            role: "user",
            content:
              'Create a user profile for John who is 30 years old with tags "developer" and "engineer". Return as JSON with structure: {user: {name, age}, tags: []}',
            id: "test-msg-3",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        schema,
      });

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      if (res) {
        expect(res.user.name).toBe("John");
        expect(res.user.age).toBe(30);
        expect(res.tags).toContain("developer");
        expect(res.tags).toContain("engineer");
      }
    }, TIMEOUT);

    test("handles system and user messages together", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({ result: z.number() });

      const [err, res] = await llm.generateObject({
        messages: [
          {
            role: "system",
            content: "You are a calculator. Always respond with JSON containing a 'result' field.",
            id: "test-msg-sys",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
          {
            role: "user",
            content: "What is 5 * 6?",
            id: "test-msg-4",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        schema,
      });

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      if (res) {
        expect(res.result).toBe(30);
      }
    }, TIMEOUT);

    test("handles multi-turn conversation with agent messages", async () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY,
        model: "mistral-small-latest",
        temperature: 0.3,
      });
      const llm = new MistralLLM(cfg);
      const schema = z.object({ answer: z.number() });

      const [err, res] = await llm.generateObject({
        messages: [
          {
            role: "user",
            content: "What is 10 + 5?",
            id: "test-msg-5",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
          {
            role: "agent",
            content: "15",
            id: "test-msg-6",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
          {
            role: "user",
            content: "Now multiply that by 2. Return JSON with an 'answer' field.",
            id: "test-msg-7",
            createdAt: Date.now(),
            lastUpdated: Date.now(),
          },
        ],
        schema,
      });

      expect(err).toBeUndefined();
      expect(res).toBeDefined();
      if (res) {
        expect(res.answer).toBe(30);
      }
    }, TIMEOUT);
  });

  
  describe("LLM Instance Properties", () => {
    test("stores configuration on instance", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: "test-key",
        model: "mistral-large-latest",
        temperature: 0.7,
      });
      const llm = new MistralLLM(cfg);

      expect(llm.config.provider).toBe("mistral");
      expect(llm.config.model).toBe("mistral-large-latest");
      expect(llm.config.temperature).toBe(0.7);
    });
  });
});
