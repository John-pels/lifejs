import { describe, expect, it, vi } from "vitest";
import type { Message } from "@/shared/messages";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { TransportClient } from "@/transport/types";
import { MemoryServer } from "./server";
import type { MemoryDefinition, MemoryPosition } from "./types";

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
    trace: vi.fn((_name, fn) => fn()),
    log: { error: vi.fn() },
  }) as unknown as TelemetryClient;

const createMessage = (content: string, role: "user" | "system" = "user"): Message => ({
  id: `msg_${Date.now()}`,
  role,
  content,
  createdAt: Date.now(),
  lastUpdated: Date.now(),
});

const createDefinition = (overrides: Partial<MemoryDefinition> = {}): MemoryDefinition => ({
  name: "test-memory",
  dependencies: [],
  messages: [],
  position: { section: "bottom", align: "end" },
  ...overrides,
});

const createServer = (definition: Partial<MemoryDefinition> = {}) =>
  new MemoryServer({
    transport: createMockTransport(),
    telemetry: createMockTelemetry(),
    definition: createDefinition(definition),
    dependencies: {},
  });

describe("MemoryServer", () => {
  describe("compute()", () => {
    it("computes static messages array", async () => {
      const messages = [createMessage("Hello")];
      const server = createServer({ messages });

      const [err, result] = await server.compute([]);

      expect(err).toBeUndefined();
      expect(result).toHaveLength(1);
      expect(result?.[0]?.role === "user" && result?.[0]?.content).toBe("Hello");
    });

    it("computes dynamic messages function", async () => {
      const server = createServer({
        messages: ({ history }) => [createMessage(`Got ${history.length} messages`)],
      });

      const [err, result] = await server.compute([createMessage("a"), createMessage("b")]);

      expect(err).toBeUndefined();
      expect(result?.[0]?.role === "user" && result?.[0]?.content).toBe("Got 2 messages");
    });

    it("skips computation when disabled", async () => {
      const messagesFn = vi.fn(() => [createMessage("test")]);
      const server = createServer({ messages: messagesFn });
      const accessor = server.getAccessor();

      await accessor.setEnabled(false);
      const [err] = await server.compute([]);

      expect(err).toBeUndefined();
      expect(messagesFn).not.toHaveBeenCalled();
    });

    it("emits messagesChange only when messages change", async () => {
      const server = createServer({ messages: [createMessage("static")] });
      const listener = vi.fn();
      server.on("messagesChange", listener);

      await server.compute([]);
      expect(listener).toHaveBeenCalledTimes(1);

      await server.compute([]);
      expect(listener).toHaveBeenCalledTimes(1); // No second emit
    });

    it("normalizes CreateMessageInput to Message", async () => {
      const server = createServer({
        messages: [{ role: "user", content: "from input" }],
      });

      const [err, result] = await server.compute([]);

      expect(err).toBeUndefined();
      expect(result?.[0]).toMatchObject({
        role: "user",
        content: "from input",
      });
      expect(result?.[0]?.id).toBeDefined();
      expect(result?.[0]?.createdAt).toBeDefined();
    });

    it("handles null/undefined output", async () => {
      const server = createServer({ messages: null as never });
      const [err, result] = await server.compute([]);

      expect(err).toBeUndefined();
      expect(result).toEqual([]);
    });
  });

  describe("getAccessor()", () => {
    it("returns correct state values", async () => {
      const server = createServer({ messages: [createMessage("test")] });
      const accessor = server.getAccessor();

      await server.compute([]);

      expect(await accessor.messages()).toHaveLength(1);
      expect(await accessor.position()).toEqual({ section: "bottom", align: "end" });
      expect(await accessor.enabled()).toBe(true);
    });
  });

  describe("setPosition()", () => {
    it("updates position and emits event", async () => {
      const server = createServer();
      const accessor = server.getAccessor();
      const listener = vi.fn();
      server.on("positionChange", listener);

      const newPosition: MemoryPosition = { section: "top", align: "start" };
      await accessor.setPosition(newPosition);

      expect(await accessor.position()).toEqual(newPosition);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ data: { position: newPosition } }),
      );
    });

    it("does not emit when position unchanged", async () => {
      const server = createServer({ position: { section: "top", align: "start" } });
      const accessor = server.getAccessor();
      const listener = vi.fn();
      server.on("positionChange", listener);

      await accessor.setPosition({ section: "top", align: "start" });

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("setEnabled()", () => {
    it("updates enabled and emits event", async () => {
      const server = createServer();
      const accessor = server.getAccessor();
      const listener = vi.fn();
      server.on("enabledChange", listener);

      await accessor.setEnabled(false);

      expect(await accessor.enabled()).toBe(false);
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ data: { enabled: false } }));
    });

    it("does not emit when enabled unchanged", async () => {
      const server = createServer();
      const accessor = server.getAccessor();
      const listener = vi.fn();
      server.on("enabledChange", listener);

      await accessor.setEnabled(true); // Already true by default

      expect(listener).not.toHaveBeenCalled();
    });
  });
});
