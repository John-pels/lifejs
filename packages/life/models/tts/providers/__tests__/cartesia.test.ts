import { beforeEach, describe, expect, test, vi } from "vitest";
import { CartesiaTTS, cartesiaTTSConfig } from "../cartesia";

// Mock storage for the socket - needs to be outside to be shared
let mockSocketInstance: any = null;

const createMockSuccessSocket = () => {
  const socket = {
    send: vi.fn((_: string) => {}),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    close: vi.fn(),
  };

  const wsResponse = {
    on: vi.fn((event: string, handler: (data: any) => void) => {
      if (event === "message") {
        // Immediately trigger the handler
        setImmediate(() => {
          handler(JSON.stringify({ type: "chunk", data: Buffer.from([1,2,3]).toString("base64") }));
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
          handler(JSON.stringify({ type: "chunk", data: Buffer.from([1,2,3]).toString("base64") }));
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
      }) 
    },
  })),
}));

describe("CartesiaTTS Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Don't reset to null - set a default mock
    mockSocketInstance = createMockSuccessSocket();
  });

  describe("Configuration", () => {
    test("validates correct configuration", () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: "test-key",
        model: "sonic-2",
        language: "en",
      });
      expect(cfg.provider).toBe("cartesia");
      expect(cfg.model).toBe("sonic-2");
      expect(cfg.language).toBe("en");
    });

    test("throws error when no API key is provided", () => {
      const cfg = cartesiaTTSConfig.schema.parse({ provider: "cartesia" });
      expect(() => new CartesiaTTS(cfg)).toThrow(
        "CARTESIA_API_KEY environment variable or config.apiKey must be provided",
      );
    });
  });

  describe("generate()", () => {
    test("returns op.success with valid job", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: "k",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);
      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();
      expect(job?.id).toBeDefined();
      expect(typeof job?.pushText).toBe("function");
      expect(typeof job?.getStream).toBe("function");
    });
  });

  describe("pushText()", () => {
    test("returns op.success on successful push", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: "k",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);
      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      const [pushErr] = await (tts as any)._onGeneratePushText(job, "hello", true);
      expect(pushErr).toBeUndefined();
      expect(mockSocketInstance.send).toHaveBeenCalled();
    });

    test("returns op.failure on send error", async () => {
      // Set error socket BEFORE creating instance
      mockSocketInstance = createMockErrorSocket();
      
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: "k",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);
      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      const [pushErr] = await (tts as any)._onGeneratePushText(job, "hello", true);
      expect(pushErr?.code).toBe("Upstream");
      expect(pushErr?.message).toBe("Failed to send text");
    });

    test("handles empty or invalid text", async () => {
      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: "k",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);
      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      const [pushErr1] = await (tts as any)._onGeneratePushText(job, "", true);
      expect(pushErr1?.code).toBe("Validation");

      const [pushErr2] = await (tts as any)._onGeneratePushText(job, null, true);
      expect(pushErr2?.code).toBe("Validation");
    });
  });

  describe("Stream handling", () => {
   test("handles websocket events correctly", async () => {
      // Spy on receiveChunk to verify messages are processed
      let receiveChunkSpy: any;

      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: "k",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      // Spy on the receiveChunk method
      receiveChunkSpy = vi.spyOn(job!.raw, "receiveChunk");

      // Push text to trigger messages
      const [pushErr] = await (tts as any)._onGeneratePushText(job, "hello", true);
      expect(pushErr).toBeUndefined();

      // Wait for async message handlers to fire
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));

      // Verify the mock was called
      expect(mockSocketInstance.send).toHaveBeenCalled();
      
      // Verify receiveChunk was called with chunks
      expect(receiveChunkSpy).toHaveBeenCalled();
      
      // Check that we received content chunks
      const calls = receiveChunkSpy.mock.calls;
      const contentChunks = calls.filter((call: any) => call[0]?.type === "content");
      const endChunks = calls.filter((call: any) => call[0]?.type === "end");
      
      expect(contentChunks.length).toBeGreaterThan(0);
      expect(endChunks.length).toBeGreaterThan(0);
      expect(contentChunks[0][0].voiceChunk instanceof Int16Array).toBe(true);
    });

    test("handles stream errors", async () => {
      // Set error socket BEFORE creating instance
      mockSocketInstance = createMockErrorSocket();

      const cfg = cartesiaTTSConfig.schema.parse({
        provider: "cartesia",
        apiKey: "k",
        model: "sonic-2",
        language: "en",
      });
      const tts = new CartesiaTTS(cfg);

      const [err, job] = await tts.generate();
      expect(err).toBeUndefined();

      // Push some text - this should fail and return error
      const [pushErr] = await (tts as any)._onGeneratePushText(job, "hello", true);
      expect(pushErr?.code).toBe("Upstream");
      expect(pushErr?.message).toBe("Failed to send text");
    });
  });
});
