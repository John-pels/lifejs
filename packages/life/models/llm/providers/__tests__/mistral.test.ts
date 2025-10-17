import { beforeEach, describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { MistralLLM, mistralLLMConfig } from "../mistral";
import { createCommonLLMTests } from "../../../tests/common/llm";

const API_KEY_REGEX = /MISTRAL_API_KEY/;

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
        apiKey:  process.env.MISTRAL_API_KEY,
      });
      expect(cfg.model).toBe("mistral-small-latest");
    });

    test("sets temperature default to 0.5", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey:  process.env.MISTRAL_API_KEY,
      });
      expect(cfg.temperature).toBe(0.5);
    });

    test("allows temperature range from 0 to 1", () => {
      const testValues = [0, 0.25, 0.5, 0.75, 1];
      testValues.forEach((temp) => {
        const cfg = mistralLLMConfig.schema.parse({
          provider: "mistral",
          apiKey:  process.env.MISTRAL_API_KEY,
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
          apiKey:  process.env.MISTRAL_API_KEY,
          model,
        });
        expect(cfg.model).toBe(model);
      });
    });

    test("supports Pixtral vision models", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey:  process.env.MISTRAL_API_KEY,
        model: "pixtral-large-latest",
      });
      expect(cfg.model).toBe("pixtral-large-latest");
    });

    test("supports Codestral code models", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey:  process.env.MISTRAL_API_KEY,
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
          apiKey:  process.env.MISTRAL_API_KEY,
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
  
  describe("LLM Instance Properties", () => {
    test("stores configuration on instance", () => {
      const cfg = mistralLLMConfig.schema.parse({
        provider: "mistral",
        apiKey: process.env.MISTRAL_API_KEY || "test-key",
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
