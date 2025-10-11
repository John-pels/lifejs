import { describe, expect, test, vi, beforeEach } from "vitest";
import { LivekitEOU, livekitEOUConfig } from "../livekit";
import * as op from "@/shared/operation";

// Mock ONNX inference to test error paths
vi.mock("onnxruntime-node", () => ({
  InferenceSession: {
    create: vi.fn(async () => ({
      run: vi.fn(async () => {
        throw new Error("inference error");
      }),
    })),
  },
  Tensor: vi.fn(),
}));

describe("LivekitEOU Provider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Configuration", () => {
    test("validates correct configuration", () => {
      const cfg = livekitEOUConfig.schema.parse({ provider: "livekit" });
      expect(cfg.provider).toBe("livekit");
    });
  });

  describe("predict()", () => {
    test("returns op.success(0) for empty messages", async () => {
      const cfg = livekitEOUConfig.schema.parse({ provider: "livekit" });
      const eou = new LivekitEOU(cfg);
      const [err, prob] = await eou.predict([]);
      expect(err).toBeUndefined();
      expect(prob).toBe(0);
    });

    test("returns op.failure on inference error", async () => {
      const cfg = livekitEOUConfig.schema.parse({ provider: "livekit" });
      const eou = new LivekitEOU(cfg);
      const [err, prob] = await eou.predict([{ role: "user", content: "hello" }] as any);
      expect(prob).toBeUndefined();
      expect(err?.code).toBe("Upstream");
      expect(err?.message).toMatch(/Livekit EOU error/);
    });

    test("handles invalid message format", async () => {
      const cfg = livekitEOUConfig.schema.parse({ provider: "livekit" });
      const eou = new LivekitEOU(cfg);
      const [err] = await eou.predict([{ invalid: "message" }] as any);
      expect(err?.code).toBe("Upstream");
      expect(err?.message).toMatch(/Livekit EOU error/);
    });

    test("handles null messages", async () => {
      const cfg = livekitEOUConfig.schema.parse({ provider: "livekit" });
      const eou = new LivekitEOU(cfg);
      const [err] = await eou.predict(null as any);
      expect(err?.code).toBe("Validation");
      expect(err?.message).toBe("Messages must be provided");
    });

    test("handles undefined messages", async () => {
      const cfg = livekitEOUConfig.schema.parse({ provider: "livekit" });
      const eou = new LivekitEOU(cfg);
      const [err] = await eou.predict(undefined as any);
      expect(err?.code).toBe("Validation");
      expect(err?.message).toBe("Messages must be provided");
    });
  });
});
