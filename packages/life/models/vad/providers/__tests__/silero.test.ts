import { beforeEach, describe, expect, test, vi } from "vitest";
import { SileroVAD, sileroVADConfig } from "../silero";

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

describe("SileroVAD Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set default successful ONNX
    mockOnnxInstance = createSuccessOnnx();
  });

  describe("Configuration", () => {
    test("validates correct configuration", () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      expect(cfg.provider).toBe("silero");
    });
  });

  describe("checkActivity() with successful ONNX", () => {
    test("returns op.success(0) when not enough samples", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      const pcm = new Int16Array(160); // 10ms @ 16kHz
      const [err, prob] = await vad.checkActivity(pcm);
      expect(err).toBeUndefined();
      expect(prob).toBe(0);
    });

    test("processes audio data correctly", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      const pcm = new Int16Array(1024); // Enough samples to trigger inference
      const [err, prob] = await vad.checkActivity(pcm);
      expect(err).toBeUndefined();
      expect(prob).toBe(0.75);
    });

    test("handles null/undefined audio data", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      const [err1] = await vad.checkActivity(null as any);
      expect(err1?.code).toBe("Validation");
      expect(err1?.message).toBe("Audio data cannot be null or undefined");

      const [err2] = await vad.checkActivity(undefined as any);
      expect(err2?.code).toBe("Validation");
      expect(err2?.message).toBe("Invalid audio data");
    });

    test("handles invalid audio data type", async () => {
      const cfg = sileroVADConfig.schema.parse({ provider: "silero" });
      const vad = new SileroVAD(cfg);
      
      const [err] = await vad.checkActivity(new Uint8Array(1024) as any);
      expect(err?.code).toBe("Validation");
      expect(err?.message).toBe("Invalid audio data type");
    });
  });

  describe("checkActivity() with ONNX errors", () => {
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
    });
  });

  describe("checkActivity() with invalid ONNX output", () => {
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
  });

  describe("checkActivity() with invalid ONNX state", () => {
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
});
