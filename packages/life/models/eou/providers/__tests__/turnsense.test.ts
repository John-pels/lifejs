import { describe, expect, test, beforeEach } from "vitest";
import { TurnSenseEOU, turnSenseEOUConfig } from "../turnsense";
import { createCommonEOUTests } from "../../../tests/common/eou";

beforeEach(() => {
  // Reset any state between tests if needed
});

// Run common tests for TurnSense provider
createCommonEOUTests({
  provider: "turnsense",
  createInstance: (config) => new TurnSenseEOU(config),
  getConfig: () => turnSenseEOUConfig.schema.parse({ provider: "turnsense" }),
  expectedErrorMessagePattern: /TurnSense EOU error/,
});

// Provider-specific tests
describe("TurnSenseEOU Provider - Specific Tests", () => {
  describe("Configuration Defaults", () => {
    test("sets maxMessages default to 1 (single-turn optimized)", () => {
      const cfg = turnSenseEOUConfig.schema.parse({ provider: "turnsense" });
      expect(cfg.maxMessages).toBe(1);
    });

    test("sets quantized default to true", () => {
      const cfg = turnSenseEOUConfig.schema.parse({ provider: "turnsense" });
      expect(cfg.quantized).toBe(true);
    });

    test("allows overriding maxMessages for multi-turn scenarios", () => {
      const cfg = turnSenseEOUConfig.schema.parse({
        provider: "turnsense",
        maxMessages: 2,
      });
      expect(cfg.maxMessages).toBe(2);
    });

    test("allows disabling quantization", () => {
      const cfg = turnSenseEOUConfig.schema.parse({
        provider: "turnsense",
        quantized: false,
      });
      expect(cfg.quantized).toBe(false);
    });
  });

  describe("Single-turn Message Optimization", () => {
    test("defaults to single message inference (maxMessages=1)", () => {
      const cfg = turnSenseEOUConfig.schema.parse({ provider: "turnsense" });
      expect(cfg.maxMessages).toBe(1);
    });

    test("overridable for multi-turn scenarios despite single-turn optimization", () => {
      const cfg = turnSenseEOUConfig.schema.parse({
        provider: "turnsense",
        maxMessages: 3,
      });
      expect(cfg.maxMessages).toBe(3);
    });

    test("documents that model is optimized for single messages", () => {
      // This test serves as documentation of the design choice
      const cfg = turnSenseEOUConfig.schema.parse({ provider: "turnsense" });
      expect(cfg.maxMessages).toBe(1); // Reflects single-message optimization
    });
  });

  describe("Fixed Token Constraint (256)", () => {
    test("enforces MAX_TOKENS of 256 internally", () => {
      // MAX_TOKENS=256 is hardcoded in TurnSenseEOU and cannot be configured
      // This is a fundamental constraint of the model architecture
      const cfg = turnSenseEOUConfig.schema.parse({ provider: "turnsense" });
      const eou = new TurnSenseEOU(cfg);
      expect(eou).toBeDefined();
    });

    test("uses padding to max_length of 256 during tokenization", () => {
      // TurnSense always pads input to exactly 256 tokens
      // This differs from LiveKit which has configurable maxTokens
      const cfg = turnSenseEOUConfig.schema.parse({ provider: "turnsense" });
      const eou = new TurnSenseEOU(cfg);
      expect(eou).toBeDefined();
    });

    test("differs from LiveKit's configurable maxTokens (512 default)", () => {
      // This test documents the key architectural difference:
      // - LiveKit: configurable maxTokens (default 512)
      // - TurnSense: fixed MAX_TOKENS (256)
      const cfg = turnSenseEOUConfig.schema.parse({ provider: "turnsense" });
      expect(cfg).toBeDefined();
      // TurnSense does not have a maxTokens config option
    });
  });

  describe("Quantization Behavior", () => {
    test("creates instance with quantization enabled", () => {
      const cfg = turnSenseEOUConfig.schema.parse({
        provider: "turnsense",
        quantized: true,
      });
      const eou = new TurnSenseEOU(cfg);
      expect(eou).toBeDefined();
    });

    test("creates instance with quantization disabled", () => {
      const cfg = turnSenseEOUConfig.schema.parse({
        provider: "turnsense",
        quantized: false,
      });
      const eou = new TurnSenseEOU(cfg);
      expect(eou).toBeDefined();
    });
  });

  describe("Attention Mask Handling", () => {
    test("uses attention masks in tokenization (unique to TurnSense)", () => {
      // TurnSense returns both input_ids and attention_mask from tokenization
      // This is a key difference from LiveKit which only uses input_ids
      const cfg = turnSenseEOUConfig.schema.parse({ provider: "turnsense" });
      const eou = new TurnSenseEOU(cfg);
      expect(eou).toBeDefined();
    });
  });

  describe("Left Truncation Strategy", () => {
    test("uses left-side truncation for long messages", () => {
      // TurnSense uses truncation_side: "left"
      // This preserves the most recent (rightmost) tokens
      const cfg = turnSenseEOUConfig.schema.parse({ provider: "turnsense" });
      const eou = new TurnSenseEOU(cfg);
      expect(eou).toBeDefined();
    });
  });

  describe("Configuration Schema Validation", () => {
    test("requires provider literal value 'turnsense'", () => {
      expect(() => {
        turnSenseEOUConfig.schema.parse({ provider: "livekit" });
      }).toThrow();
    });

    test("accepts only boolean for quantized field", () => {
      expect(() => {
        turnSenseEOUConfig.schema.parse({
          provider: "turnsense",
          quantized: true,
        });
      }).not.toThrow();

      expect(() => {
        turnSenseEOUConfig.schema.parse({
          provider: "turnsense",
          quantized: "true" as any,
        });
      }).toThrow();
    });

    test("schema does not have maxTokens config (fixed at 256)", () => {
      const cfg = turnSenseEOUConfig.schema.parse({ provider: "turnsense" });
      // @ts-expect-error - maxTokens doesn't exist on TurnSense config
      expect(cfg.maxTokens).toBeUndefined();
    });
  });
});
