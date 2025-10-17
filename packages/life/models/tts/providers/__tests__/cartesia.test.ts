import { beforeEach, describe, expect, test, vi } from "vitest";
import { CartesiaTTS, cartesiaTTSConfig } from "../cartesia";
import { createCommonTTSTests } from "../../../tests/common/tts";

// Mock storage for the socket - needs to be outside to be shared
let mockSocketInstance: any = null;

const createMockSuccessSocket = () => {
  const socket = {
    send: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  };

  const wsResponse = {
    on: vi.fn((event: string, handler: (data: any) => void) => {
      if (event === "message") {
        // Immediately trigger the handler
        setImmediate(() => {
          handler(JSON.stringify({ type: "chunk", data: Buffer.from([1, 2, 3]).toString("base64") }));
          handler(JSON.stringify({ type: "done" }));
        });
      }
      return wsResponse;
    }),
    off: vi.fn(),
  };

  return {
    socket,
    send: vi.fn(() => Promise.resolve(wsResponse)),
    on: vi.fn((event: string, handler: (data: any) => void) => {
      if (event === "message") {
        setImmediate(() => {
          handler(JSON.stringify({ type: "chunk", data: Buffer.from([1, 2, 3]).toString("base64") }));
          handler(JSON.stringify({ type: "done" }));
        });
      }
      return wsResponse;
    }),
    off: vi.fn(),
  };
};

const createMockErrorSocket = () => {
  const socket = {
    send: vi.fn(() => {
      throw new Error("Mock send error");
    }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  };

  const wsResponse = {
    on: vi.fn((event: string, handler: (data: any) => void) => {
      if (event === "message") {
        setImmediate(() => {
          handler(JSON.stringify({ type: "error", error: "Mock send error" }));
        });
      }
      return wsResponse;
    }),
    off: vi.fn(),
  };

  return {
    socket,
    send: vi.fn(() => Promise.reject(new Error("Mock send error"))),
    on: vi.fn((event: string, handler: (data: any) => void) => {
      if (event === "message") {
        setImmediate(() => {
          handler(JSON.stringify({ type: "error", error: "Mock send error" }));
        });
      }
      return wsResponse;
    }),
    off: vi.fn(),
  };
};

// Mock the Cartesia module at the top level
vi.mock("@cartesia/cartesia-js", () => ({
  CartesiaClient: vi.fn().mockImplementation(() => ({
    tts: {
      websocket: vi.fn(() => {
        // Return the current mockSocketInstance
        return mockSocketInstance;
      }),
    },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Set a default successful socket
  mockSocketInstance = createMockSuccessSocket();
});

// Run common tests for Cartesia provider (unit tests with mocks)
createCommonTTSTests({
  provider: "cartesia",
  createInstance: (config) => new CartesiaTTS(config),
  getConfig: () =>
    cartesiaTTSConfig.schema.parse({
      provider: "cartesia",
      apiKey: process.env.CARTESIA_API_KEY || "test-key",
      model: "sonic-2",
      language: "en",
    }),
  skipIntegrationTests: true, // Skip integration tests for unit tests
});

// Provider-specific tests
describe("CartesiaTTS - Specific Tests", () => {
  describe("Configuration Defaults", () => {
    test("sets model default to sonic-2", () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY ||"test-key",
      });
      expect(cfg.model).toBe("sonic-2");
    });

    test("sets language default to en", () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
      });
      expect(cfg.language).toBe("en");
    });

    test("sets default voiceId", () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
      });
      expect(cfg.voiceId).toBeDefined();
      expect(typeof cfg.voiceId).toBe("string");
    });

    test("supports sonic-turbo model", () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-turbo",
      });
      expect(cfg.model).toBe("sonic-turbo");
    });

    test("supports sonic model", () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic",
      });
      expect(cfg.model).toBe("sonic");
    });

    test("supports multiple languages", () => {
      const languages = ["en", "es", "fr", "de", "ja", "zh"];
      languages.forEach((lang) => {
        const cfg = cartesiaTTSConfig.schema.parse({
          provider: "cartesia",
          apiKey: process.env.CARTESIA_API_KEY || "test-key",
          language: lang,
        });
        expect(cfg.language).toBe(lang);
      });
    });

    test("allows custom voiceId", () => {
      const customVoiceId = "custom-voice-id";
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        voiceId: customVoiceId,
      });
      expect(cfg.voiceId).toBe(customVoiceId);
    });

    test("requires apiKey field", () => {
      expect(() => {
        cartesiaTTSConfig.schema.parse({
          provider: "cartesia",
        });
      }).toThrow();
    });

    test("requires provider literal value 'cartesia'", () => {
      expect(() => {
        cartesiaTTSConfig.schema.parse({
          provider: "openai",
          apiKey: process.env.CARTESIA_API_KEY || "test-key",
        });
      }).toThrow();
    });

    test("throws error when no API key provided to constructor", () => {
      const cfg = cartesiaTTSConfig.schema.parse({ provider: "cartesia" });
      expect(() => new CartesiaTTS(cfg)).toThrow(/CARTESIA_API_KEY/);
    });
  });

  describe("generate() - Unit Tests", () => {
    test("returns op.success with valid job", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();
      expect(job?.id).toBeDefined();
      expect(typeof job?.pushText).toBe("function");
      expect(typeof job?.getStream).toBe("function");

      if (job) job.cancel();
    });

    test("job can be used to push text", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (job) {
        // pushText is fire-and-forget (void)
        job.pushText("Hello world", true);
        expect(mockSocketInstance.send).toBeDefined();

        job.cancel();
      }
    });
  });

  describe("pushText() - Unit Tests", () => {
    test("accepts valid text", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      const [pushErr] = await (tts as any)._onGeneratePushText(job, "hello world", true);
      expect(pushErr).toBeUndefined();
      expect(mockSocketInstance.send).toHaveBeenCalled();

      if (job) job.cancel();
    });

    test("rejects null text", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      const [pushErr] = await (tts as any)._onGeneratePushText(job, null, true);
      expect(pushErr).toBeDefined();
      expect(pushErr?.code).toBe("Validation");
      expect(pushErr?.message).toContain("non-empty string");

      if (job) job.cancel();
    });

    test("rejects undefined text", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      const [pushErr] = await (tts as any)._onGeneratePushText(job, undefined, true);
      expect(pushErr).toBeDefined();
      expect(pushErr?.code).toBe("Validation");

      if (job) job.cancel();
    });

    test("rejects empty text", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      const [pushErr] = await (tts as any)._onGeneratePushText(job, "", true);
      expect(pushErr).toBeDefined();
      expect(pushErr?.code).toBe("Validation");

      if (job) job.cancel();
    });

    test("rejects whitespace-only text", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      const [pushErr] = await (tts as any)._onGeneratePushText(job, "   ", true);
      expect(pushErr).toBeDefined();
      expect(pushErr?.code).toBe("Validation");

      if (job) job.cancel();
    });

    test("handles send errors", async () => {
      // Set error socket BEFORE creating instance
      mockSocketInstance = createMockErrorSocket();

      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      const [pushErr] = await (tts as any)._onGeneratePushText(job, "hello", true);
      expect(pushErr?.code).toBe("Upstream");
      expect(pushErr?.message).toBe("Failed to send text");

      if (job) job.cancel();
    });
  });

  describe("Stream Handling - Unit Tests", () => {
    test("handles websocket chunk events correctly", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      if (!job) return;

      // Spy on receiveChunk to verify messages are processed
      const receiveChunkSpy = vi.spyOn(job.raw, "receiveChunk");

      // Push text to trigger message handlers
      const [pushErr] = await (tts as any)._onGeneratePushText(job, "hello", true);
      expect(pushErr).toBeUndefined();

      // Wait for async message handlers
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      // Verify mock was called
      expect(mockSocketInstance.send).toHaveBeenCalled();

      // Verify receiveChunk was called with chunks
      expect(receiveChunkSpy).toHaveBeenCalled();

      // Check that we received chunks
      const calls = receiveChunkSpy.mock.calls;
      const contentChunks = calls.filter((call: any) => call[0]?.type === "content");
      const endChunks = calls.filter((call: any) => call[0]?.type === "end");

      expect(contentChunks.length).toBeGreaterThan(0);
      expect(endChunks.length).toBeGreaterThan(0);
      
      // Verify content chunk has voiceChunk that is Int16Array
      if (contentChunks.length > 0) {
        const firstContentChunk = contentChunks[0];
        if (firstContentChunk && firstContentChunk[0]) {
          const chunkData = firstContentChunk[0];
          // Type guard: only check voiceChunk if type is "content"
          if (chunkData.type === "content") {
            expect(chunkData.voiceChunk).toBeDefined();
            expect(chunkData.voiceChunk instanceof Int16Array).toBe(true);
          }
        }
      }

      receiveChunkSpy.mockRestore();
      if (job) job.cancel();
    });

    test("handles stream error events", async () => {
      // Set error socket BEFORE creating instance
      mockSocketInstance = createMockErrorSocket();

      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      if (!job) return;

      // Spy on receiveChunk
      const receiveChunkSpy = vi.spyOn(job.raw, "receiveChunk");

      // Push text to trigger error
      const [pushErr] = await (tts as any)._onGeneratePushText(job, "hello", true);
      expect(pushErr?.code).toBe("Upstream");

      receiveChunkSpy.mockRestore();
      if (job) job.cancel();
    });

    test("handles job cancellation", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      if (!job) return;

      // Cancel should not throw
      expect(() => job.cancel()).not.toThrow();

      // Verify abort signal is set
      expect(job.raw.abortController.signal.aborted).toBe(true);
    });
  });

  describe("TTS Instance Properties", () => {
    test("creates instance successfully", () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: process.env.CARTESIA_API_KEY || "test-key",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      // Verify instance is created successfully
      expect(tts).toBeDefined();
      expect(typeof tts.generate).toBe("function");
    });
  });
});
