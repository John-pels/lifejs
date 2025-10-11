import { beforeEach, describe, expect, test, vi } from "vitest";
import * as op from "@/shared/operation";
import { DeepgramSTT, deepgramSTTConfig } from "../deepgram";

// Shared mock socket instance
let mockSocketInstance: any = null;

// Create successful websocket mock
const createSuccessSocket = () => ({
  on: vi.fn((event: string, handler: Function) => {
    if (event === "Transcript") {
      // Simulate successful transcription
      handler({ 
        channel: { 
          alternatives: [{ transcript: "test transcription" }] 
        } 
      });
    }
  }),
  keepAlive: vi.fn(),
  requestClose: vi.fn(),
  send: vi.fn(),
});

// Create error websocket mock
const createErrorSocket = () => ({
  on: vi.fn((event: string, handler: Function) => {
    if (event === "Transcript") {
      handler({ 
        channel: { 
          alternatives: [{ transcript: "test transcription" }] 
        } 
      });
    }
  }),
  keepAlive: vi.fn(),
  requestClose: vi.fn(),
  send: vi.fn(() => {
    throw new Error("Mock send error");
  }),
});

// Mock Deepgram SDK at the top level
vi.mock("@deepgram/sdk", () => ({
  LiveTranscriptionEvents: { Transcript: "Transcript" },
  createClient: vi.fn(() => ({
    listen: { 
      live: vi.fn(() => mockSocketInstance) 
    },
  })),
}));

describe("DeepgramSTT Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default successful socket
    mockSocketInstance = createSuccessSocket();
  });

  describe("Configuration", () => {
    test("validates correct configuration", () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-3",
        language: "en",
      });
      expect(cfg.provider).toBe("deepgram");
      expect(cfg.model).toBe("nova-3");
      expect(cfg.language).toBe("en");
    });

    test("throws error when no API key is provided", () => {
      const cfg = deepgramSTTConfig.schema.parse({ provider: "deepgram" });
      expect(() => new DeepgramSTT(cfg)).toThrow(
        "DEEPGRAM_API_KEY environment variable or config.apiKey must be provided"
      );
    });
  });

  describe("generate()", () => {
    test("returns op.success with valid job", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "k",
        model: "nova-3",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();
      expect(job?.id).toBeDefined();
      expect(typeof job?.pushVoice).toBe("function");
      expect(typeof job?.getStream).toBe("function");
    });
  });

  describe("pushVoice()", () => {
    test("returns op.success on successful push", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "k",
        model: "nova-3",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      const pcm = new Int16Array(160);
      const [pushErr] = await (stt as any)._onGeneratePushVoice(job, pcm);
      expect(pushErr).toBeUndefined();
      expect(mockSocketInstance.send).toHaveBeenCalled();
    });

    test("returns op.failure on send error", async () => {
      // Override with error socket
      mockSocketInstance = createErrorSocket();

      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "k",
        model: "nova-3",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      const pcm = new Int16Array(160);
      const [pushErr] = await (stt as any)._onGeneratePushVoice(job, pcm);
      expect(pushErr).toBeDefined();
      expect(pushErr?.code).toBe("Upstream");
      expect(pushErr?.message).toBe("Failed to send audio");
    });

    test("handles invalid audio data", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "k",
        model: "nova-3",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      const [pushErr] = await (stt as any)._onGeneratePushVoice(job, null);
      expect(pushErr?.code).toBe("Validation");
      expect(pushErr?.message).toBe("Invalid audio data");
    });
  });

  describe("Stream handling", () => {
    test("handles websocket events correctly", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "k",
        model: "nova-3",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      // Verify that the socket.on was called with Transcript event
      expect(mockSocketInstance.on).toHaveBeenCalledWith("Transcript", expect.any(Function));

      // Get the handler that was passed to socket.on
      const calls = mockSocketInstance.on.mock.calls;
      const transcriptCall = calls.find((call: any) => call[0] === "Transcript");
      expect(transcriptCall).toBeDefined();

      // The handler should have been called synchronously during generate()
      // Verify by checking if the transcript text is correct
      // We can verify this by spying on receiveChunk after generate completes
      const receiveChunkSpy = vi.spyOn(job!.raw, "receiveChunk");

      // Call the handler manually to verify it works
      const handler = transcriptCall[1];
      handler({ 
        channel: { 
          alternatives: [{ transcript: "manual test" }] 
        } 
      });

      // Now verify receiveChunk was called
      expect(receiveChunkSpy).toHaveBeenCalledWith({
        type: "content",
        textChunk: "manual test",
      });
    });
  });
});
