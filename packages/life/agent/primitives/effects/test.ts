import { describe, expect, it, vi } from "vitest";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { TransportClient } from "@/transport/types";
import { EffectServer } from "./server";
import type { EffectDefinition } from "./types";

// Mocks
const createMockTransport = (): TransportClient =>
  ({
    register: vi.fn(),
    call: vi.fn(),
    sendText: vi.fn(),
    receiveText: vi.fn(),
  }) as unknown as TransportClient;

const createMockTelemetry = (): TelemetryClient =>
  ({
    trace: vi.fn(async (_name, fn) => {
      try {
        return await fn();
      } catch (error) {
        return [{ code: "Unknown", message: String(error) }, undefined] as const;
      }
    }),
    log: { error: vi.fn() },
  }) as unknown as TelemetryClient;

const createDefinition = (
  setup: EffectDefinition["setup"] = vi.fn(),
): EffectDefinition => ({
  name: "test-effect",
  dependencies: [],
  setup,
});

const createServer = (setup?: EffectDefinition["setup"]) =>
  new EffectServer({
    transport: createMockTransport(),
    telemetry: createMockTelemetry(),
    definition: createDefinition(setup),
    dependencies: {},
  });

describe("EffectServer", () => {
  describe("mount()", () => {
    it("calls setup and emits mounted event", async () => {
      const setup = vi.fn();
      const server = createServer(setup);
      const listener = vi.fn();
      server.on("mounted", listener);

      const [err] = await server.mount();

      expect(err).toBeUndefined();
      expect(setup).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ data: { inMs: expect.any(Number) } }),
      );
    });

    it("fails if already mounted", async () => {
      const server = createServer();

      await server.mount();
      const [err] = await server.mount();

      expect(err?.code).toBe("Conflict");
      expect(err?.message).toContain("already mounted");
    });

    it("captures cleanup function from setup", async () => {
      const cleanup = vi.fn();
      const server = createServer(() => cleanup);

      await server.mount();
      await server.unmount();

      expect(cleanup).toHaveBeenCalled();
    });

    it("emits mountError when setup throws", async () => {
      const server = createServer(() => {
        throw new Error("Setup failed");
      });
      const listener = vi.fn();
      server.on("mountError", listener);

      const [err] = await server.mount();

      expect(err).toBeDefined();
      expect(listener).toHaveBeenCalled();
    });
  });

  describe("unmount()", () => {
    it("calls cleanup and emits unmounted event", async () => {
      const cleanup = vi.fn();
      const server = createServer(() => cleanup);
      const listener = vi.fn();
      server.on("unmounted", listener);

      await server.mount();
      const [err] = await server.unmount();

      expect(err).toBeUndefined();
      expect(cleanup).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ data: { inMs: expect.any(Number) } }),
      );
    });

    it("fails if not mounted", async () => {
      const server = createServer();

      const [err] = await server.unmount();

      expect(err?.code).toBe("Conflict");
      expect(err?.message).toContain("not mounted");
    });

    it("fails if already unmounted", async () => {
      const server = createServer();

      await server.mount();
      await server.unmount();
      const [err] = await server.unmount();

      expect(err?.code).toBe("Conflict");
      expect(err?.message).toContain("already unmounted");
    });
  });

  describe("getAccessor()", () => {
    it("returns correct state after mount/unmount lifecycle", async () => {
      const server = createServer();
      const accessor = server.getAccessor();

      // Before mount
      expect(await accessor.hasMounted()).toBe(false);
      expect(await accessor.hasUnmounted()).toBe(false);
      expect(await accessor.mountedInMs()).toBe(-1);

      // After mount
      await server.mount();
      expect(await accessor.hasMounted()).toBe(true);
      expect(await accessor.mountedInMs()).toBeGreaterThanOrEqual(0);

      // After unmount
      await server.unmount();
      expect(await accessor.hasUnmounted()).toBe(true);
      expect(await accessor.unmountedInMs()).toBeGreaterThanOrEqual(0);
    });
  });
});
