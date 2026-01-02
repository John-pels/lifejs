import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { MockTransportClient } from "@/transport/client/mock";
import { EventEmitter } from "./index";
import type { EventEmitterDefinition } from "./types";

const EVENT_ID_PATTERN = /^event_/;

// Test event definition
const testDefinition = [
  { name: "ping", dataSchema: z.object({ timestamp: z.number() }) },
  { name: "pong", dataSchema: z.object({ value: z.string() }) },
  { name: "notify" }, // Event without data
] as const satisfies EventEmitterDefinition;

type TestDefinition = typeof testDefinition;

// Concrete implementation for testing (since EventEmitter is abstract)
class TestEmitter extends EventEmitter<TestDefinition> {
  constructor(transportConfig?: {
    transport: MockTransportClient;
    prefix: string;
  }) {
    super(testDefinition, transportConfig);
  }

  // Expose emit for testing
  testEmit(...args: Parameters<typeof this.emit>) {
    return this.emit(...args);
  }
}

// Helper to wait for async RPC calls to complete
async function waitForRPC(ms = 50) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Helper to create connected transport clients
function createConnectedClients() {
  const clientA = new MockTransportClient("a");
  const clientB = new MockTransportClient("b");
  clientA.addPeer(clientB);
  clientB.addPeer(clientA);
  return { clientA, clientB };
}

describe("EventEmitter", () => {
  describe("emit and on", () => {
    it("should emit events to listeners", () => {
      const emitter = new TestEmitter();
      const callback = vi.fn();

      emitter.on("ping", callback);
      emitter.testEmit({ name: "ping", data: { timestamp: 123 } });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "ping",
          data: { timestamp: 123 },
          id: expect.stringContaining("event_"),
        }),
      );
    });

    it("should not emit to unrelated listeners", () => {
      const emitter = new TestEmitter();
      const pingCallback = vi.fn();
      const pongCallback = vi.fn();

      emitter.on("ping", pingCallback);
      emitter.on("pong", pongCallback);
      emitter.testEmit({ name: "ping", data: { timestamp: 123 } });

      expect(pingCallback).toHaveBeenCalledTimes(1);
      expect(pongCallback).not.toHaveBeenCalled();
    });

    it("should support events without data", () => {
      const emitter = new TestEmitter();
      const callback = vi.fn();

      emitter.on("notify", callback);
      emitter.testEmit({ name: "notify", data: undefined });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "notify",
          data: undefined,
        }),
      );
    });
  });

  describe("selectors", () => {
    it("should support wildcard selector", () => {
      const emitter = new TestEmitter();
      const callback = vi.fn();

      emitter.on("*", callback);
      emitter.testEmit({ name: "ping", data: { timestamp: 1 } });
      emitter.testEmit({ name: "pong", data: { value: "test" } });
      emitter.testEmit({ name: "notify", data: undefined });

      expect(callback).toHaveBeenCalledTimes(3);
    });

    it("should support array selector", () => {
      const emitter = new TestEmitter();
      const callback = vi.fn();

      emitter.on(["ping", "pong"], callback);
      emitter.testEmit({ name: "ping", data: { timestamp: 1 } });
      emitter.testEmit({ name: "pong", data: { value: "test" } });
      emitter.testEmit({ name: "notify", data: undefined });

      expect(callback).toHaveBeenCalledTimes(2);
    });
  });

  describe("once", () => {
    it("should only trigger callback once", () => {
      const emitter = new TestEmitter();
      const callback = vi.fn();

      emitter.once("ping", callback);
      emitter.testEmit({ name: "ping", data: { timestamp: 1 } });
      emitter.testEmit({ name: "ping", data: { timestamp: 2 } });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ data: { timestamp: 1 } }));
    });
  });

  describe("unsubscribe", () => {
    it("should stop receiving events after unsubscribe", () => {
      const emitter = new TestEmitter();
      const callback = vi.fn();

      const unsubscribe = emitter.on("ping", callback);
      emitter.testEmit({ name: "ping", data: { timestamp: 1 } });
      unsubscribe();
      emitter.testEmit({ name: "ping", data: { timestamp: 2 } });

      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("validation", () => {
    it("should validate event data with zod schema", () => {
      const emitter = new TestEmitter();
      const callback = vi.fn();

      emitter.on("ping", callback);
      // @ts-expect-error - intentionally passing wrong data type
      const result = emitter.testEmit({ name: "ping", data: { timestamp: "not-a-number" } });
      if (!result) throw new Error("Expected result");

      const [error, data] = result;
      expect(error).toBeDefined();
      expect(error?.code).toBe("Validation");
      expect(error?.message).toContain("Invalid event data");
      expect(data).toBeUndefined();
      expect(callback).not.toHaveBeenCalled();
    });

    it("should fail for undefined event types", () => {
      const emitter = new TestEmitter();
      // @ts-expect-error - intentionally passing undefined event name
      const result = emitter.testEmit({ name: "unknown-event", data: {} });
      if (!result) throw new Error("Expected result");

      const [error, data] = result;
      expect(error).toBeDefined();
      expect(error?.code).toBe("Validation");
      expect(error?.message).toContain("not defined");
      expect(data).toBeUndefined();
    });
  });

  describe("transport sync", () => {
    describe("basic sync", () => {
      it("should sync listeners across transport (A -> B)", async () => {
        const { clientA, clientB } = createConnectedClients();
        await clientA.joinRoom();
        await clientB.joinRoom();

        const emitterA = new TestEmitter({ transport: clientA, prefix: "test" });
        const emitterB = new TestEmitter({ transport: clientB, prefix: "test" });

        const callbackA = vi.fn();
        const callbackB = vi.fn();

        emitterA.on("ping", callbackA);
        emitterB.on("ping", callbackB);

        await waitForRPC();

        emitterA.testEmit({ name: "ping", data: { timestamp: 999 } });

        expect(callbackA).toHaveBeenCalledTimes(1);
        await waitForRPC();
        expect(callbackB).toHaveBeenCalledTimes(1);
        expect(callbackB).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "ping",
            data: { timestamp: 999 },
            id: expect.stringMatching(EVENT_ID_PATTERN),
          }),
        );
      });

      it("should sync listeners across transport (B -> A)", async () => {
        const { clientA, clientB } = createConnectedClients();
        await clientA.joinRoom();
        await clientB.joinRoom();

        const emitterA = new TestEmitter({ transport: clientA, prefix: "test" });
        const emitterB = new TestEmitter({ transport: clientB, prefix: "test" });

        const callbackA = vi.fn();
        const callbackB = vi.fn();

        emitterA.on("ping", callbackA);
        emitterB.on("ping", callbackB);

        await waitForRPC();

        emitterB.testEmit({ name: "ping", data: { timestamp: 888 } });

        expect(callbackB).toHaveBeenCalledTimes(1);
        await waitForRPC();
        expect(callbackA).toHaveBeenCalledTimes(1);
        expect(callbackA).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "ping",
            data: { timestamp: 888 },
          }),
        );
      });

      it("should sync events without data across transport", async () => {
        const { clientA, clientB } = createConnectedClients();
        await clientA.joinRoom();
        await clientB.joinRoom();

        const emitterA = new TestEmitter({ transport: clientA, prefix: "test" });
        const emitterB = new TestEmitter({ transport: clientB, prefix: "test" });

        const callbackB = vi.fn();
        emitterB.on("notify", callbackB);

        await waitForRPC();

        emitterA.testEmit({ name: "notify", data: undefined });

        await waitForRPC();
        expect(callbackB).toHaveBeenCalledTimes(1);
        expect(callbackB).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "notify",
            data: undefined,
          }),
        );
      });

      it("should call local listeners when transport is configured", async () => {
        const { clientA, clientB } = createConnectedClients();
        await clientA.joinRoom();
        await clientB.joinRoom();

        const emitterA = new TestEmitter({ transport: clientA, prefix: "test" });
        const localCallback = vi.fn();

        emitterA.on("ping", localCallback);

        await waitForRPC();

        emitterA.testEmit({ name: "ping", data: { timestamp: 123 } });

        expect(localCallback).toHaveBeenCalledTimes(1);
        expect(localCallback).toHaveBeenCalledWith(
          expect.objectContaining({
            name: "ping",
            data: { timestamp: 123 },
          }),
        );
      });
    });

    describe("selectors with transport", () => {
      it("should sync wildcard selector across transport", async () => {
        const { clientA, clientB } = createConnectedClients();
        await clientA.joinRoom();
        await clientB.joinRoom();

        const emitterA = new TestEmitter({ transport: clientA, prefix: "test" });
        const emitterB = new TestEmitter({ transport: clientB, prefix: "test" });

        const callbackB = vi.fn();
        emitterB.on("*", callbackB);

        await waitForRPC();

        emitterA.testEmit({ name: "ping", data: { timestamp: 1 } });
        emitterA.testEmit({ name: "pong", data: { value: "test" } });
        emitterA.testEmit({ name: "notify", data: undefined });

        await waitForRPC();
        expect(callbackB).toHaveBeenCalledTimes(3);
      });

      it("should sync array selector across transport", async () => {
        const { clientA, clientB } = createConnectedClients();
        await clientA.joinRoom();
        await clientB.joinRoom();

        const emitterA = new TestEmitter({ transport: clientA, prefix: "test" });
        const emitterB = new TestEmitter({ transport: clientB, prefix: "test" });

        const callbackB = vi.fn();
        emitterB.on(["ping", "pong"], callbackB);

        await waitForRPC();

        emitterA.testEmit({ name: "ping", data: { timestamp: 1 } });
        emitterA.testEmit({ name: "pong", data: { value: "test" } });
        emitterA.testEmit({ name: "notify", data: undefined });

        await waitForRPC();
        expect(callbackB).toHaveBeenCalledTimes(2);
      });
    });

    describe("once with transport", () => {
      it("should sync once listener across transport", async () => {
        const { clientA, clientB } = createConnectedClients();
        await clientA.joinRoom();
        await clientB.joinRoom();

        const emitterA = new TestEmitter({ transport: clientA, prefix: "test" });
        const emitterB = new TestEmitter({ transport: clientB, prefix: "test" });

        const callbackB = vi.fn();
        emitterB.once("ping", callbackB);

        await waitForRPC();

        emitterA.testEmit({ name: "ping", data: { timestamp: 1 } });
        await waitForRPC();
        expect(callbackB).toHaveBeenCalledTimes(1);

        emitterA.testEmit({ name: "ping", data: { timestamp: 2 } });
        await waitForRPC();
        expect(callbackB).toHaveBeenCalledTimes(1);
      });
    });

    describe("unsubscribe with transport", () => {
      it("should unsubscribe remote listeners via transport", async () => {
        const { clientA, clientB } = createConnectedClients();
        await clientA.joinRoom();
        await clientB.joinRoom();

        const emitterA = new TestEmitter({ transport: clientA, prefix: "test" });
        const emitterB = new TestEmitter({ transport: clientB, prefix: "test" });

        const callbackB = vi.fn();
        const unsubscribe = emitterB.on("ping", callbackB);

        await waitForRPC();

        emitterA.testEmit({ name: "ping", data: { timestamp: 1 } });
        await waitForRPC();
        expect(callbackB).toHaveBeenCalledTimes(1);

        unsubscribe();
        await waitForRPC();

        emitterA.testEmit({ name: "ping", data: { timestamp: 2 } });
        await waitForRPC();
        expect(callbackB).toHaveBeenCalledTimes(1);
      });
    });

    describe("multiple listeners", () => {
      it("should sync multiple remote listeners", async () => {
        const { clientA, clientB } = createConnectedClients();
        await clientA.joinRoom();
        await clientB.joinRoom();

        const emitterA = new TestEmitter({ transport: clientA, prefix: "test" });
        const emitterB = new TestEmitter({ transport: clientB, prefix: "test" });

        const callbackB1 = vi.fn();
        const callbackB2 = vi.fn();
        const callbackB3 = vi.fn();

        emitterB.on("ping", callbackB1);
        emitterB.on("ping", callbackB2);
        emitterB.on("pong", callbackB3);

        await waitForRPC();

        emitterA.testEmit({ name: "ping", data: { timestamp: 1 } });
        await waitForRPC();

        expect(callbackB1).toHaveBeenCalledTimes(1);
        expect(callbackB2).toHaveBeenCalledTimes(1);
        expect(callbackB3).not.toHaveBeenCalled();

        emitterA.testEmit({ name: "pong", data: { value: "test" } });
        await waitForRPC();

        expect(callbackB1).toHaveBeenCalledTimes(1);
        expect(callbackB2).toHaveBeenCalledTimes(1);
        expect(callbackB3).toHaveBeenCalledTimes(1);
      });
    });

    describe("multiple emitters with different prefixes", () => {
      it("should isolate emitters with different prefixes", async () => {
        const { clientA, clientB } = createConnectedClients();
        await clientA.joinRoom();
        await clientB.joinRoom();

        const emitterA1 = new TestEmitter({ transport: clientA, prefix: "prefix1" });
        const emitterA2 = new TestEmitter({ transport: clientA, prefix: "prefix2" });
        const emitterB1 = new TestEmitter({ transport: clientB, prefix: "prefix1" });
        const emitterB2 = new TestEmitter({ transport: clientB, prefix: "prefix2" });

        const callbackB1 = vi.fn();
        const callbackB2 = vi.fn();

        emitterB1.on("ping", callbackB1);
        emitterB2.on("ping", callbackB2);

        await waitForRPC();

        emitterA1.testEmit({ name: "ping", data: { timestamp: 1 } });
        await waitForRPC();

        expect(callbackB1).toHaveBeenCalledTimes(1);
        expect(callbackB2).not.toHaveBeenCalled();

        emitterA2.testEmit({ name: "ping", data: { timestamp: 2 } });
        await waitForRPC();

        expect(callbackB1).toHaveBeenCalledTimes(1);
        expect(callbackB2).toHaveBeenCalledTimes(1);
      });
    });

    describe("without transport", () => {
      it("should work without transport configured", () => {
        const emitter = new TestEmitter();
        const callback = vi.fn();

        emitter.on("ping", callback);
        emitter.testEmit({ name: "ping", data: { timestamp: 123 } });

        expect(callback).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe("event ID generation", () => {
    it("should generate unique IDs for each event", () => {
      const emitter = new TestEmitter();
      const events: { id: string }[] = [];

      emitter.on("ping", (event) => {
        events.push(event);
      });
      emitter.testEmit({ name: "ping", data: { timestamp: 1 } });
      emitter.testEmit({ name: "ping", data: { timestamp: 2 } });
      emitter.testEmit({ name: "ping", data: { timestamp: 3 } });

      expect(events).toHaveLength(3);
      const ids = events.map((e) => e.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(3);
    });

    it("should prefix event IDs with 'event_'", () => {
      const emitter = new TestEmitter();
      let capturedId = "";

      emitter.on("ping", (event) => {
        capturedId = event.id;
      });
      emitter.testEmit({ name: "ping", data: { timestamp: 1 } });

      expect(capturedId).toMatch(EVENT_ID_PATTERN);
    });
  });
});
