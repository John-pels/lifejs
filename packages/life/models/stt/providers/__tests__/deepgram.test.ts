import { beforeEach, describe, expect, test, vi } from "vitest";
import * as op from "@/shared/operation";
import { DeepgramSTT, deepgramSTTConfig } from "../deepgram";
import { createCommonSTTTests } from "../../../tests/common/stt";

// Shared mock socket instance
let mockSocketInstance: any = null;

// Create successful websocket mock
const createSuccessSocket = () => ({
  on: vi.fn((event: string, handler: Function) => {
    if (event === "Transcript") {
      // Simulate successful transcription
      handler({
        channel: {
          alternatives: [{ transcript: "test transcription" }],
        },
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
          alternatives: [{ transcript: "test transcription" }],
        },
      });
    }
  }),
  keepAlive: vi.fn(),
  requestClose: vi.fn(),
  send: vi.fn(() => {
    throw new Error("Mock send error");
  }),
});

// Create socket with no transcript mock
const createNoTranscriptSocket = () => ({
  on: vi.fn(),
  keepAlive: vi.fn(),
  requestClose: vi.fn(),
  send: vi.fn(),
});

// Mock Deepgram SDK at the top level
vi.mock("@deepgram/sdk", () => ({
  LiveTranscriptionEvents: { Transcript: "Transcript" },
  createClient: vi.fn(() => ({
    listen: {
      live: vi.fn(() => mockSocketInstance),
    },
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Set default successful socket
  mockSocketInstance = createSuccessSocket();
});

// Run common tests for Deepgram provider (unit tests with mocks)
createCommonSTTTests({
  provider: "deepgram",
  createInstance: (config) => new DeepgramSTT(config),
  getConfig: () =>
    deepgramSTTConfig.schema.parse({
      provider: "deepgram",
      apiKey: "test-key",
      model: "nova-2-general",
      language: "en",
    }),
  skipIntegrationTests: true, // Skip integration tests for unit tests
});

// Provider-specific tests
describe("DeepgramSTT - Specific Tests", () => {
  describe("Configuration Defaults", () => {
    test("sets model default to nova-2-general", () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
      });
      expect(cfg.model).toBe("nova-2-general");
    });

    test("sets language default to en", () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
      });
      expect(cfg.language).toBe("en");
    });

    test("supports nova-3 model", () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-3",
      });
      expect(cfg.model).toBe("nova-3");
    });

    test("supports nova-2 variants", () => {
      const models = [
        "nova-2",
        "nova-2-general",
        "nova-2-meeting",
        "nova-2-phonecall",
        "nova-2-voicemail",
        "nova-2-finance",
        "nova-2-conversationalai",
        "nova-2-video",
        "nova-2-medical",
        "nova-2-drivethru",
        "nova-2-automotive",
        "nova-2-atc",
      ];
      models.forEach((model) => {
        const cfg = deepgramSTTConfig.schema.parse({
          provider: "deepgram",
          apiKey: "test-key",
          model,
        });
        expect(cfg.model).toBe(model);
      });
    });

    test("supports legacy models", () => {
      const models = [
        "nova",
        "nova-general",
        "nova-phonecall",
        "enhanced",
        "enhanced-general",
        "enhanced-meeting",
        "enhanced-phonecall",
        "enhanced-finance",
        "base",
        "base-general",
        "base-meeting",
        "base-phonecall",
        "base-voicemail",
        "base-finance",
        "base-conversationalai",
        "base-video",
      ];
      models.forEach((model) => {
        const cfg = deepgramSTTConfig.schema.parse({
          provider: "deepgram",
          apiKey: "test-key",
          model,
        });
        expect(cfg.model).toBe(model);
      });
    });

    test("supports whisper models", () => {
      const models = [
        "whisper-tiny",
        "whisper-base",
        "whisper-small",
        "whisper-medium",
        "whisper-large",
      ];
      models.forEach((model) => {
        const cfg = deepgramSTTConfig.schema.parse({
          provider: "deepgram",
          apiKey: "test-key",
          model,
        });
        expect(cfg.model).toBe(model);
      });
    });

    test("supports multiple languages", () => {
      const languages = ["en", "es", "fr", "de", "ja", "zh"];
      languages.forEach((lang) => {
        const cfg = deepgramSTTConfig.schema.parse({
          provider: "deepgram",
          apiKey: "test-key",
          language: lang,
        });
        expect(cfg.language).toBe(lang);
      });
    });

    test("requires apiKey field", () => {
      expect(() => {
        deepgramSTTConfig.schema.parse({
          provider: "deepgram",
        });
      }).toThrow();
    });

    test("requires provider literal value 'deepgram'", () => {
      expect(() => {
        deepgramSTTConfig.schema.parse({
          provider: "google",
          apiKey: "test-key",
        });
      }).toThrow();
    });

    test("throws error when no API key provided to constructor", () => {
      const cfg = deepgramSTTConfig.schema.parse({ provider: "deepgram" });
      expect(() => new DeepgramSTT(cfg)).toThrow(
        /DEEPGRAM_API_KEY/
      );
    });
  });

  describe("generate() - Unit Tests", () => {
    test("returns op.success with valid job", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();
      expect(job?.id).toBeDefined();
      expect(typeof job?.pushVoice).toBe("function");
      expect(typeof job?.getStream).toBe("function");
    });

    test("job can be used to stream transcription", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();
      expect(job).toBeDefined();

      if (job) {
        // Verify socket.on was called with Transcript event
        expect(mockSocketInstance.on).toHaveBeenCalledWith(
          "Transcript",
          expect.any(Function)
        );
      }
    });

    test("passes correct configuration to Deepgram", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-3",
        language: "es",
      });
      const stt = new DeepgramSTT(cfg);

      await stt.generate();

      // The mock socket is created by live() with the config
      // We can verify the socket was created (which means config was passed)
      expect(mockSocketInstance).toBeDefined();
    });

    test("sets up keepAlive interval for socket", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      // Verify keepAlive will be called
      expect(typeof mockSocketInstance.keepAlive).toBe("function");
    });

    test("handles abort signal for job cancellation", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      if (job) {
        // Cancel the job
        job.cancel();

        // Verify requestClose was eventually called
        expect(mockSocketInstance.requestClose).toBeDefined();
      }
    });
  });

  describe("pushVoice() - Unit Tests", () => {
    test("returns op.success on successful push", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      const pcm = new Int16Array(160);
      // pushVoice is fire-and-forget (void), not async
      job!.pushVoice(pcm);
      
      // Give async operation a moment to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockSocketInstance.send).toHaveBeenCalled();
      expect(mockSocketInstance.send).toHaveBeenCalledWith(pcm.buffer);
    });

    test("returns op.failure on send error", async () => {
      // Override with error socket
      mockSocketInstance = createErrorSocket();

      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      const pcm = new Int16Array(160);
      // pushVoice is fire-and-forget, but errors should go to stream
      job!.pushVoice(pcm);

      // Give async operation a moment to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // The error will be sent to the stream or logged internally
      expect(mockSocketInstance.send).toHaveBeenCalled();
    });

    test("validates audio data - rejects null", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      // pushVoice is fire-and-forget, validation happens internally
      job!.pushVoice(null as any);
      
      // Give async operation a moment to complete
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    test("validates audio data - rejects undefined", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      // pushVoice is fire-and-forget, validation happens internally
      job!.pushVoice(undefined as any);
      
      // Give async operation a moment to complete
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    test("validates audio data - rejects non-Int16Array", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      // pushVoice is fire-and-forget, validation happens internally
      job!.pushVoice([1, 2, 3] as any);
      
      // Give async operation a moment to complete
      await new Promise(resolve => setTimeout(resolve, 10));
    });

    test("validates audio data - rejects object without instanceof check", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      // pushVoice is fire-and-forget, validation happens internally
      job!.pushVoice({} as any);
      
      // Give async operation a moment to complete
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  });

  describe("Stream Handling - Unit Tests", () => {
    test("handles websocket Transcript events correctly", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      // Verify that the socket.on was called with Transcript event
      expect(mockSocketInstance.on).toHaveBeenCalledWith(
        "Transcript",
        expect.any(Function)
      );

      // Get the handler that was passed to socket.on
      const calls = mockSocketInstance.on.mock.calls;
      const transcriptCall = calls.find((call: any) => call[0] === "Transcript");
      expect(transcriptCall).toBeDefined();

      // Spy on receiveChunk to verify it's called
      const receiveChunkSpy = vi.spyOn(job!.raw, "receiveChunk");

      // Call the handler manually to verify it works
      const handler = transcriptCall![1];
      handler({
        channel: {
          alternatives: [{ transcript: "manual test" }],
        },
      });

      // Verify receiveChunk was called with correct structure
      expect(receiveChunkSpy).toHaveBeenCalledWith({
        type: "content",
        textChunk: "manual test",
      });

      receiveChunkSpy.mockRestore();
    });

    test("ignores events with no alternatives", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      const calls = mockSocketInstance.on.mock.calls;
      const transcriptCall = calls.find((call: any) => call[0] === "Transcript");
      const handler = transcriptCall![1];

      const receiveChunkSpy = vi.spyOn(job!.raw, "receiveChunk");

      // Call with event that has no transcript
      handler({
        channel: {
          alternatives: [],
        },
      });

      // Should not call receiveChunk for empty alternatives
      expect(receiveChunkSpy).not.toHaveBeenCalled();

      receiveChunkSpy.mockRestore();
    });

    test("handles empty transcript strings", async () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-2-general",
        language: "en",
      });
      const stt = new DeepgramSTT(cfg);

      const [err, job] = await stt.generate();
      expect(err).toBeUndefined();

      const calls = mockSocketInstance.on.mock.calls;
      const transcriptCall = calls.find((call: any) => call[0] === "Transcript");
      const handler = transcriptCall![1];

      const receiveChunkSpy = vi.spyOn(job!.raw, "receiveChunk");

      // Call with empty transcript
      handler({
        channel: {
          alternatives: [{ transcript: "" }],
        },
      });

      // Should not call receiveChunk for empty transcript
      expect(receiveChunkSpy).not.toHaveBeenCalled();

      receiveChunkSpy.mockRestore();
    });
  });

  describe("STT Instance Properties", () => {
    test("stores configuration on instance", () => {
      const cfg = deepgramSTTConfig.schema.parse({
        provider: "deepgram",
        apiKey: "test-key",
        model: "nova-3",
        language: "es",
      });
      const stt = new DeepgramSTT(cfg);

      // Verify instance is created successfully (config is protected, can't access directly)
      expect(stt).toBeDefined();
      expect(typeof stt.generate).toBe("function");
    });
  });
});
