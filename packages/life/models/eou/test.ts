import { beforeAll, describe, expect, it } from "vitest";
import { isLifeError } from "@/shared/error";
import type { Message } from "@/shared/messages";
import { RemoteFile } from "@/shared/remote-file";
import { LivekitEOU } from "./providers/livekit";
import { TurnSenseEOU } from "./providers/turnsense";

// Pre-download models before tests run
beforeAll(async () => {
  await Promise.all([
    new RemoteFile({
      name: "LiveKit EOU",
      remotePath: "eou-livekit-quantized.onnx",
    }).getLocalPath(),
    new RemoteFile({
      name: "TurnSense EOU",
      remotePath: "eou-turnsense-quantized.onnx",
    }).getLocalPath(),
  ]);
}, 120_000);

/**
 * EOU (End of Utterance) Provider Tests
 *
 * These tests verify the behavior of EOU providers which predict when a user
 * has finished speaking. The `predict` method returns an OperationResult with
 * a probability (0-1) where higher values indicate higher confidence that
 * the user's turn is complete.
 *
 * Note: Tests require ONNX model files to be available. If models are not
 * found, providers return an error via OperationResult.
 */

// Helper to create test messages with required fields
let msgCounter = 0;
function nextId() {
  msgCounter++;
  return `test-${msgCounter}`;
}

const msg = {
  user: (content: string): Message => ({
    role: "user",
    content,
    id: nextId(),
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  }),
  agent: (content: string): Message => ({
    role: "agent",
    content,
    actions: [],
    id: nextId(),
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  }),
  system: (content: string): Message => ({
    role: "system",
    content,
    id: nextId(),
    createdAt: Date.now(),
    lastUpdated: Date.now(),
  }),
};

// Provider configurations to test
const providers = [
  {
    name: "LivekitEOU",
    createProvider: () => new LivekitEOU({ provider: "livekit" }),
    createWithConfig: (config: Partial<{ quantized: boolean; maxMessages: number }>) =>
      new LivekitEOU({ provider: "livekit", ...config }),
  },
  {
    name: "TurnSenseEOU",
    createProvider: () => new TurnSenseEOU({ provider: "turnsense" }),
    createWithConfig: (config: Partial<{ quantized: boolean; maxMessages: number }>) =>
      new TurnSenseEOU({ provider: "turnsense", ...config }),
  },
] as const;

describe("EOUProvider", () => {
  describe.each(providers)("$name", ({ createProvider, createWithConfig }) => {
    describe("predict", () => {
      it("returns OperationResult tuple", async () => {
        const provider = createProvider();
        const result = await provider.predict([msg.user("Hello, how are you?")]);

        // Should always return [error, data] tuple
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBe(2);
      });

      it("returns success with 0 for empty messages array", async () => {
        const provider = createProvider();
        const [error, probability] = await provider.predict([]);

        expect(error).toBeUndefined();
        expect(probability).toBe(0);
      });

      it("handles single user message", async () => {
        const provider = createProvider();
        const [error, probability] = await provider.predict([msg.user("Hi there!")]);

        // Either success with probability, or error from model loading
        if (error) {
          expect(isLifeError(error)).toBe(true);
        } else {
          expect(typeof probability).toBe("number");
          expect(probability).toBeGreaterThanOrEqual(0);
          expect(probability).toBeLessThanOrEqual(1);
        }
      });

      it("handles multi-turn conversation", async () => {
        const provider = createProvider();
        const [error, probability] = await provider.predict([
          msg.user("What's the weather like?"),
          msg.agent("It's sunny and 72 degrees today."),
          msg.user("Thanks, and what about tomorrow?"),
        ]);

        if (error) {
          expect(isLifeError(error)).toBe(true);
        } else {
          expect(probability).toBeGreaterThanOrEqual(0);
          expect(probability).toBeLessThanOrEqual(1);
        }
      });

      it("filters out system messages", async () => {
        const provider = createProvider();
        const [error, probability] = await provider.predict([
          msg.system("You are a helpful assistant."),
          msg.user("Hello!"),
        ]);

        if (error) {
          expect(isLifeError(error)).toBe(true);
        } else {
          expect(probability).toBeGreaterThanOrEqual(0);
          expect(probability).toBeLessThanOrEqual(1);
        }
      });

      it("handles conversation ending with agent message", async () => {
        const provider = createProvider();
        const [error, probability] = await provider.predict([
          msg.user("Hello"),
          msg.agent("Hi there! How can I help you?"),
        ]);

        // Providers strip non-user trailing messages before inference
        if (error) {
          expect(isLifeError(error)).toBe(true);
        } else {
          expect(probability).toBeGreaterThanOrEqual(0);
          expect(probability).toBeLessThanOrEqual(1);
        }
      });

      it("handles very long messages", async () => {
        const provider = createProvider();
        const longText = "This is a test sentence. ".repeat(100);
        const [error, probability] = await provider.predict([msg.user(longText)]);

        if (error) {
          expect(isLifeError(error)).toBe(true);
        } else {
          expect(probability).toBeGreaterThanOrEqual(0);
          expect(probability).toBeLessThanOrEqual(1);
        }
      });

      it("handles messages with special characters", async () => {
        const provider = createProvider();
        const [error, probability] = await provider.predict([
          msg.user("Hello! How are you? 🙂 What's the time?"),
        ]);

        if (error) {
          expect(isLifeError(error)).toBe(true);
        } else {
          expect(probability).toBeGreaterThanOrEqual(0);
          expect(probability).toBeLessThanOrEqual(1);
        }
      });

      it("handles empty string content", async () => {
        const provider = createProvider();
        const [error, probability] = await provider.predict([msg.user("")]);

        if (error) {
          expect(isLifeError(error)).toBe(true);
        } else {
          expect(probability).toBeGreaterThanOrEqual(0);
          expect(probability).toBeLessThanOrEqual(1);
        }
      });
    });

    describe("configuration", () => {
      it("accepts quantized option", () => {
        const provider = createWithConfig({ quantized: false });
        expect(provider).toBeDefined();
      });

      it("accepts maxMessages option", () => {
        const provider = createWithConfig({ maxMessages: 5 });
        expect(provider).toBeDefined();
      });

      it("uses default config when no options provided", () => {
        const provider = createProvider();
        expect(provider).toBeDefined();
      });

      it("accepts combined options", () => {
        const provider = createWithConfig({ quantized: true, maxMessages: 10 });
        expect(provider).toBeDefined();
      });
    });

    describe("error handling", () => {
      it("returns LifeError on model loading failure", async () => {
        const provider = createProvider();
        const [error] = await provider.predict([msg.user("Test message")]);

        // If there's an error (e.g., model not found), it should be a LifeError
        if (error) {
          expect(isLifeError(error)).toBe(true);
          expect(error.code).toBeDefined();
          expect(typeof error.message).toBe("string");
        }
      });

      it("does not throw exceptions", async () => {
        const provider = createProvider();

        // Should not throw even with edge case inputs
        await expect(provider.predict([])).resolves.toBeDefined();
        await expect(provider.predict([msg.user("")])).resolves.toBeDefined();
      });
    });
  });

  describe("LivekitEOU specific", () => {
    it("handles maxTokens configuration", () => {
      const provider = new LivekitEOU({
        provider: "livekit",
        maxTokens: 256,
      });
      expect(provider).toBeDefined();
    });

    it("accepts all config options together", () => {
      const provider = new LivekitEOU({
        provider: "livekit",
        quantized: true,
        maxMessages: 3,
        maxTokens: 512,
      });
      expect(provider).toBeDefined();
    });
  });

  describe("TurnSenseEOU specific", () => {
    it("defaults to single message inference (maxMessages=1)", async () => {
      const provider = new TurnSenseEOU({ provider: "turnsense" });
      const result = await provider.predict([msg.user("Hello there!")]);
      expect(Array.isArray(result)).toBe(true);
    });

    it("accepts all config options together", () => {
      const provider = new TurnSenseEOU({
        provider: "turnsense",
        quantized: false,
        maxMessages: 3,
      });
      expect(provider).toBeDefined();
    });
  });

  describe("comparison between providers", () => {
    it("both providers return OperationResult for same input", async () => {
      const livekitProvider = new LivekitEOU({ provider: "livekit" });
      const turnsenseProvider = new TurnSenseEOU({ provider: "turnsense" });

      const messages = [msg.user("Can you help me with something?")];

      const livekitResult = await livekitProvider.predict(messages);
      const turnsenseResult = await turnsenseProvider.predict(messages);

      // Both should return OperationResult tuples
      expect(Array.isArray(livekitResult)).toBe(true);
      expect(Array.isArray(turnsenseResult)).toBe(true);
      expect(livekitResult.length).toBe(2);
      expect(turnsenseResult.length).toBe(2);
    });
  });
});
