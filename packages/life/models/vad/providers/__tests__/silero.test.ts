import { beforeEach, describe, expect, test, vi } from "vitest";
import { SileroVAD, sileroVADConfig } from "../silero";
import { createCommonVADTests } from "../../../tests/common/vad";

// Mock storage for ONNX instance - shared across tests
let mockOnnxInstance: any = null;

// Create mock for successful ONNX
const createSuccessOnnx = () => ({
  InferenceSession: {
    create: vi.fn(async () => ({
      run: vi.fn(async () => ({
        output: { data: new Float32Array([0.75]) },
        stateN: { data: new Float32Array(256) },
      })),
    })),
  },
  Tensor: vi.fn(),
});

// Create mock for ONNX that throws inference error
const createErrorOnnx = () => ({
  InferenceSession: {
    create: vi.fn(async () => ({
      run: vi.fn(async () => {
        throw new Error("Mock inference error");
      }),
    })),
  },
  Tensor: vi.fn(),
});

// Create mock for ONNX with missing output
const createMissingOutputOnnx = () => ({
  InferenceSession: {
    create: vi.fn(async () => ({
      run: vi.fn(async () => ({
        stateN: { data: new Float32Array(256) },
      })),
    })),
  },
  Tensor: vi.fn(),
});

// Create mock for ONNX with missing state
const createMissingStateOnnx = () => ({
  InferenceSession: {
    create: vi.fn(async () => ({
      run: vi.fn(async () => ({
        output: { data: new Float32Array([0.75]) },
      })),
    })),
  },
  Tensor: vi.fn(),
});

// Mock onnxruntime-node at the top level
vi.mock("onnxruntime-node", () => ({
  get InferenceSession() {
    return mockOnnxInstance?.InferenceSession;
  },
  get Tensor() {
    return mockOnnxInstance?.Tensor;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Set default successful ONNX
  mockOnnxInstance = createSuccessOnnx();
});

// Run common tests for Silero provider (unit tests with mocks)
createCommonVADTests({
  provider: "silero",
  createInstance: (config) => new SileroVAD(config),
  getConfig: () => sileroVADConfig.schema.parse({ provider: "silero" }),
  skipIntegrationTests: true, // Skip integration tests for unit tests
});

// Provider-specific tests
describe("SileroVAD - Specific Tests", () => {
  describe("Configuration Defaults", () => {
    test("validates correct configuration", () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      expect(cfg.provider).toBe("silero");
    });

    test("requires provider literal value 'silero'", () => {
      expect(() => {
        sileroVADConfig.schema.parse({ provider: "webrtc" });
      }).toThrow();
    });

    test("does not require additional configuration", () => {
      // Silero VAD only needs provider field
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      expect(Object.keys(cfg)).toEqual(["provider"]);
    });
  });

  describe("checkActivity() - Unit Tests with Successful ONNX", () => {
    test("returns op.success(0) when not enough samples", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      const pcm = new Int16Array(160); // 10ms @ 16kHz - not enough for inference
      const [err, prob] = await vad.checkActivity(pcm);
      
      expect(err).toBeUndefined();
      expect(prob).toBe(0);
    });

    test("processes audio data correctly with enough samples", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      const pcm = new Int16Array(1024); // Enough samples to trigger inference
      const [err, prob] = await vad.checkActivity(pcm);
      
      expect(err).toBeUndefined();
      expect(prob).toBe(0.75); // From mock
    });

    test("returns probability within valid range", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      const pcm = new Int16Array(1024);
      const [err, prob] = await vad.checkActivity(pcm);
      
      expect(err).toBeUndefined();
      expect(prob).toBeGreaterThanOrEqual(0);
      expect(prob).toBeLessThanOrEqual(1);
    });

    test("maintains state across multiple calls", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      // First call
      const pcm1 = new Int16Array(1024);
      const [err1, prob1] = await vad.checkActivity(pcm1);
      expect(err1).toBeUndefined();
      expect(prob1).toBe(0.75);
      
      // Second call - state should be maintained
      const pcm2 = new Int16Array(1024);
      const [err2, prob2] = await vad.checkActivity(pcm2);
      expect(err2).toBeUndefined();
      expect(prob2).toBe(0.75);
    });
  });

  describe("checkActivity() - Audio Validation", () => {
    test("handles null audio data", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      const [err] = await vad.checkActivity(null as any);
      expect(err?.code).toBe("Validation");
      expect(err?.message).toBe("Audio data cannot be null or undefined");
    });

    test("handles undefined audio data", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      const [err] = await vad.checkActivity(undefined as any);
      expect(err?.code).toBe("Validation");
      expect(err?.message).toBe("Invalid audio data");
    });

    test("handles invalid audio data type - Uint8Array", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      const [err] = await vad.checkActivity(new Uint8Array(1024) as any);
      expect(err?.code).toBe("Validation");
      expect(err?.message).toBe("Invalid audio data type");
    });

    test("handles invalid audio data type - Array", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      const [err] = await vad.checkActivity([1, 2, 3] as any);
      expect(err?.code).toBe("Validation");
      expect(err?.message).toBe("Invalid audio data type");
    });

    test("handles invalid audio data type - String", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      const [err] = await vad.checkActivity("audio" as any);
      expect(err?.code).toBe("Validation");
      expect(err?.message).toBe("Invalid audio data type");
    });
  });

  describe("checkActivity() - ONNX Error Handling", () => {
    test("handles inference errors", async () => {
      mockOnnxInstance = createErrorOnnx();
      
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);

      // Send enough samples to trigger inference
      const pcm = new Int16Array(1024);
      const [err] = await vad.checkActivity(pcm);

      expect(err).toBeDefined();
      expect(err?.code).toBe("Upstream");
      expect(err?.message).toBe("ONNX inference failed");
      expect(err?.cause).toBeDefined();
    });

    test("handles missing output tensor", async () => {
      mockOnnxInstance = createMissingOutputOnnx();
      
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);

      const pcm = new Int16Array(1024);
      const [err] = await vad.checkActivity(pcm);

      expect(err).toBeDefined();
      expect(err?.code).toBe("Upstream");
      expect(err?.message).toBe("Unexpected ONNX output: missing output or state tensors");
    });

    test("handles missing state tensor", async () => {
      mockOnnxInstance = createMissingStateOnnx();
      
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);

      const pcm = new Int16Array(1024);
      const [err] = await vad.checkActivity(pcm);

      expect(err).toBeDefined();
      expect(err?.code).toBe("Upstream");
      expect(err?.message).toBe("Unexpected ONNX output: missing output or state tensors");
    });
  });

  describe("Silero-Specific Behavior", () => {
    test("uses 512-sample window for inference", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      // 512 samples is the window size, need more for past context
      const pcm = new Int16Array(1024);
      const [err, prob] = await vad.checkActivity(pcm);
      
      expect(err).toBeUndefined();
      expect(typeof prob).toBe("number");
    });

    test("accumulates residual samples across calls", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      // Small chunks that accumulate
      for (let i = 0; i < 10; i++) {
        const pcm = new Int16Array(160);
        const [err, prob] = await vad.checkActivity(pcm);
        expect(err).toBeUndefined();
        // Early calls return 0 until enough samples accumulated
        if (i < 3) {
          expect(prob).toBe(0);
        }
      }
    });

    test("converts Int16 PCM to Float32 internally", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      // Fill with max Int16 values
      const pcm = new Int16Array(1024);
      pcm.fill(32767); // Max positive Int16
      
      const [err, prob] = await vad.checkActivity(pcm);
      
      expect(err).toBeUndefined();
      expect(prob).toBeDefined();
      // Should normalize to -1...1 range internally
    });
  });

  describe("VAD Instance Properties", () => {
    test("creates instance successfully", () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);

      // Verify instance is created successfully
      expect(vad).toBeDefined();
      expect(typeof vad.checkActivity).toBe("function");
    });

    test("instance is reusable across multiple calls", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);

      // Multiple calls should work without issues
      for (let i = 0; i < 5; i++) {
        const pcm = new Int16Array(1024);
        const [err, prob] = await vad.checkActivity(pcm);
        expect(err).toBeUndefined();
        expect(typeof prob).toBe("number");
      }
    });
  });
});
