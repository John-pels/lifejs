import { describe, expect, test, beforeEach } from "vitest";
import { LivekitEOU, livekitEOUConfig } from "../livekit";
import { createCommonEOUTests } from "../../../tests/common/eou";

beforeEach(() => {
  // Reset any state between tests if needed
});

// Run common tests for LiveKit provider
createCommonEOUTests({
  provider: "livekit",
  createInstance: (config) => new LivekitEOU(config),
  getConfig: () => livekitEOUConfig.schema.parse({ provider: "livekit" }),
  expectedErrorMessagePattern: /Livekit EOU error/,
});

// Provider-specific tests
describe("LivekitEOU Provider - Specific Tests", () => {
  describe("Configuration Defaults", () => {
    test("sets maxMessages default to 3", () => {
      const cfg = livekitEOUConfig.schema.parse({ provider: "livekit" });
      expect(cfg.maxMessages).toBe(3);
    });

    test("sets maxTokens default to 512", () => {
      const cfg = livekitEOUConfig.schema.parse({ provider: "livekit" });
      expect(cfg.maxTokens).toBe(512);
    });

    test("sets quantized default to true", () => {
      const cfg = livekitEOUConfig.schema.parse({ provider: "livekit" });
      expect(cfg.quantized).toBe(true);
    });

    test("allows overriding maxMessages", () => {
      const cfg = livekitEOUConfig.schema.parse({
        provider: "livekit",
        maxMessages: 5,
      });
      expect(cfg.maxMessages).toBe(5);
    });

    test("allows overriding maxTokens", () => {
      const cfg = livekitEOUConfig.schema.parse({
        provider: "livekit",
        maxTokens: 1024,
      });
      expect(cfg.maxTokens).toBe(1024);
    });

    test("allows disabling quantization", () => {
      const cfg = livekitEOUConfig.schema.parse({
        provider: "livekit",
        quantized: false,
      });
      expect(cfg.quantized).toBe(false);
    });
  });

  describe("Quantization Behavior", () => {
    test("creates instance with quantization enabled", () => {
      const cfg = livekitEOUConfig.schema.parse({
        provider: "livekit",
        quantized: true,
      });
      const eou = new LivekitEOU(cfg);
      expect(eou).toBeDefined();
    });

    test("creates instance with quantization disabled", () => {
      const cfg = livekitEOUConfig.schema.parse({
        provider: "livekit",
        quantized: false,
      });
      const eou = new LivekitEOU(cfg);
      expect(eou).toBeDefined();
    });
  });

  describe("Multi-turn Message Handling", () => {
    test("respects maxMessages configuration (default 3 for multi-turn)", () => {
      const cfg = livekitEOUConfig.schema.parse({
        provider: "livekit",
        maxMessages: 3,
      });
      expect(cfg.maxMessages).toBe(3);
    });

    test("accepts maxMessages in recommended range (2-5)", () => {
      const testValues = [2, 3, 4, 5];
      testValues.forEach((val) => {
        const cfg = livekitEOUConfig.schema.parse({
          provider: "livekit",
          maxMessages: val,
        });
        expect(cfg.maxMessages).toBe(val);
      });
    });

    test("allows maxMessages values outside recommended range", () => {
      // Schema allows any number, but comments recommend 2-5
      const cfg = livekitEOUConfig.schema.parse({
        provider: "livekit",
        maxMessages: 10,
      });
      expect(cfg.maxMessages).toBe(10);
    });
  });

  describe("Token Configuration", () => {
    test("allows configurable maxTokens (unlike TurnSense's fixed 256)", () => {
      const cfg = livekitEOUConfig.schema.parse({
        provider: "livekit",
        maxTokens: 256,
      });
      expect(cfg.maxTokens).toBe(256);
    });

    test("supports large maxTokens values", () => {
      const cfg = livekitEOUConfig.schema.parse({
        provider: "livekit",
        maxTokens: 2048,
      });
      expect(cfg.maxTokens).toBe(2048);
    });

    test("schema requires provider field", () => {
      expect(() => {
        livekitEOUConfig.schema.parse({});
      }).toThrow();
    });
  });

  describe("Configuration Schema Validation", () => {
    test("requires provider literal value 'livekit'", () => {
      expect(() => {
        livekitEOUConfig.schema.parse({ provider: "turnsense" });
      }).toThrow();
    });

    test("accepts only boolean for quantized field", () => {
      expect(() => {
        livekitEOUConfig.schema.parse({
          provider: "livekit",
          quantized: true,
        });
      }).not.toThrow();

      expect(() => {
        livekitEOUConfig.schema.parse({
          provider: "livekit",
          quantized: "true" as any,
        });
      }).toThrow();
    });
  });
});
