import { describe, expect, it, mock } from "bun:test";
import type { AsyncQueue } from "@/shared/async-queue";
import { ns } from "@/shared/nanoseconds";
import { createTelemetryClient } from "../node";
import type { TelemetryConsumer, TelemetryLog, TelemetrySignal } from "../types";

describe("TelemetryClient - log methods", () => {
  function createTestClient() {
    const client = createTelemetryClient("cli", {
      command: "dev",
      args: [],
    });

    const capturedLogs: TelemetryLog[] = [];

    const mockConsumer: TelemetryConsumer = {
      start: mock((queue: AsyncQueue<TelemetrySignal>) => {
        const originalPush = queue.push.bind(queue);
        queue.push = mock((signal: TelemetrySignal) => {
          if (signal.type === "log") {
            capturedLogs.push(signal as TelemetryLog);
          }
          return originalPush(signal);
        });
      }),
      isProcessing: mock(() => false),
    };

    const unregister = client.registerConsumer(mockConsumer);

    return { client, capturedLogs, unregister };
  }

  describe("telemetry.log.*() methods", () => {
    it("should log at all severity levels", () => {
      const { client, capturedLogs } = createTestClient();

      client.log.debug({ message: "Debug message" });
      client.log.info({ message: "Info message" });
      client.log.warn({ message: "Warning message" });
      client.log.error({ message: "Error message" });
      client.log.fatal({ message: "Fatal message" });

      expect(capturedLogs).toHaveLength(5);
      expect(capturedLogs[0]?.level).toBe("debug");
      expect(capturedLogs[0]?.message).toBe("Debug message");
      expect(capturedLogs[1]?.level).toBe("info");
      expect(capturedLogs[1]?.message).toBe("Info message");
      expect(capturedLogs[2]?.level).toBe("warn");
      expect(capturedLogs[2]?.message).toBe("Warning message");
      expect(capturedLogs[3]?.level).toBe("error");
      expect(capturedLogs[3]?.message).toBe("Error message");
      expect(capturedLogs[4]?.level).toBe("fatal");
      expect(capturedLogs[4]?.message).toBe("Fatal message");
    });

    it("should include attributes in logs", () => {
      const { client, capturedLogs } = createTestClient();

      client.log.info({
        message: "User action",
        attributes: {
          userId: "123",
          action: "login",
          metadata: { ip: "192.168.1.1" },
        },
      });

      expect(capturedLogs).toHaveLength(1);
      const log = capturedLogs[0];
      expect(log?.attributes?.userId).toBeDefined();
      expect(log?.attributes?.action).toBeDefined();
      expect(log?.attributes?.metadata).toBeDefined();

      if (log?.attributes?.userId && log?.attributes?.action && log?.attributes?.metadata) {
        expect(log.attributes.userId).toBe("123");
        expect(log.attributes.action).toBe("login");
        expect(log.attributes.metadata).toEqual({ ip: "192.168.1.1" });
      }
    });

    it("should handle Error objects", () => {
      const { client, capturedLogs } = createTestClient();

      const testError = new Error("Test error message");
      client.log.error({ error: testError });

      expect(capturedLogs).toHaveLength(1);
      const log = capturedLogs[0];
      expect(log?.message).toBe("Test error message");
      expect(log?.error).toBeDefined();
      expect(log?.error?.message).toBe("Test error message");
      expect(log?.error?.stack).toBeDefined();
    });

    it("should handle error with additional message", () => {
      const { client, capturedLogs } = createTestClient();

      client.log.error({
        message: "Failed to process request",
        error: new Error("Connection timeout"),
        attributes: { endpoint: "/api/users" },
      });

      expect(capturedLogs).toHaveLength(1);
      const log = capturedLogs[0];
      expect(log?.message).toBe("Failed to process request");
      expect(log?.error?.message).toBe("Connection timeout");
    });

    it("should include timestamps and IDs", () => {
      const { client, capturedLogs } = createTestClient();

      const beforeTime = ns.now();
      client.log.info({ message: "Test" });
      const afterTime = ns.now();

      const log = capturedLogs[0];
      expect(log?.id).toBeDefined();
      // biome-ignore lint/performance/useTopLevelRegex: test-specific regex
      expect(log?.id).toMatch(/^[0-9a-f]{32}$/);
      expect(log?.timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(log?.timestamp).toBeLessThanOrEqual(afterTime);
    });

    it("should include resource and scope from client", () => {
      const { client, capturedLogs } = createTestClient();

      client.log.info({ message: "Test" });

      const log = capturedLogs[0];
      expect(log?.resource.platform).toBe("node");
      expect(log?.resource.environment).toBeDefined();
      expect(log?.scope).toBe("cli");
    });

    it("should include global attributes", () => {
      const { client, capturedLogs } = createTestClient();

      client.setAttribute("service", "api");
      client.setAttribute("region", "us-west-2");

      client.log.info({ message: "Test", attributes: { requestId: "abc123" } });

      const log = capturedLogs[0];
      expect(log?.attributes?.service).toBeDefined();
      expect(log?.attributes?.region).toBeDefined();
      expect(log?.attributes?.requestId).toBeDefined();

      if (log?.attributes?.service && log?.attributes?.region && log?.attributes?.requestId) {
        expect(log.attributes.service).toBe("api");
        expect(log.attributes.region).toBe("us-west-2");
        expect(log.attributes.requestId).toBe("abc123");
      }
    });

    it("should include stack trace for all logs", () => {
      const { client, capturedLogs } = createTestClient();

      client.log.info({ message: "Test" });

      const log = capturedLogs[0];
      expect(log?.stack).toBeDefined();
      expect(typeof log?.stack).toBe("string");
    });

    it("should not have parent span context when logged outside trace", () => {
      const { client, capturedLogs } = createTestClient();

      client.log.info({ message: "Test" });

      const log = capturedLogs[0];
      expect(log?.traceId).toBeUndefined();
      expect(log?.spanId).toBeUndefined();
    });
  });

  describe("span.log.*() methods", () => {
    it("should attach logs to the current span", async () => {
      const { client, capturedLogs } = createTestClient();

      using span = (await client.trace("operation")).start();
      span.log.info({ message: "Operation started" });
      span.log.debug({ message: "Debug info", attributes: { step: 1 } });
      span.log.warn({ message: "Warning during operation" });
      span.log.error({ error: new Error("Operation error") });
      span.log.fatal({ message: "Fatal error", error: new Error("Critical failure") });

      // Logs should be in the global consumer immediately
      expect(capturedLogs).toHaveLength(5);

      // Access the span to check logs are attached
      const currentSpanHandle = client.getCurrentSpan();
      const spanData = currentSpanHandle?.getData();
      expect(spanData?.logs).toHaveLength(5);
      expect(spanData?.logs[0]?.message).toBe("Operation started");
      expect(spanData?.logs[1]?.message).toBe("Debug info");
      expect(spanData?.logs[2]?.message).toBe("Warning during operation");
      expect(spanData?.logs[3]?.message).toBe("Operation error");
      expect(spanData?.logs[4]?.message).toBe("Fatal error");
    });

    it("should include parent span context in logs", async () => {
      const { client } = createTestClient();

      using span = (await client.trace("test-span")).start();
      const currentSpanHandle = client.getCurrentSpan();

      span.log.info({ message: "Test log" });

      const spanData = currentSpanHandle?.getData();
      const firstLog = spanData?.logs[0];
      expect(firstLog).toBeDefined();
      if (firstLog && "parentTraceId" in firstLog) {
        expect(firstLog.parentTraceId).toBe(spanData?.traceId);
      }
      if (firstLog && "parentSpanId" in firstLog) {
        expect(firstLog.parentSpanId).toBe(spanData?.id);
      }
    });

    it("should handle nested span logs correctly", async () => {
      const { client } = createTestClient();

      using parent = (await client.trace("parent")).start();
      parent.log.info({ message: "Parent log" });

      using child = (await client.trace("child")).start();
      child.log.info({ message: "Child log" });

      const currentSpanHandle = client.getCurrentSpan();
      const spanData = currentSpanHandle?.getData();
      // Current span should be child
      expect(spanData?.name).toBe("child");
      expect(spanData?.logs).toHaveLength(1);
      expect(spanData?.logs[0]?.message).toBe("Child log");
    });

    it("should prevent logging after span ends", async () => {
      const { client } = createTestClient();
      const errors: string[] = [];

      // Capture error logs
      const origError = client.log.error;
      client.log.error = mock((input: { message: string }) => {
        errors.push(input.message);
        origError.call(client.log, input);
      });

      using span = (await client.trace("test")).start();
      span.end();

      // These should trigger error logs
      span.log.info({ message: "Should fail" });
      span.log.error({ error: new Error("Should also fail") });

      expect(errors).toHaveLength(2);
      expect(errors[0]).toContain("log.info");
      expect(errors[0]).toContain("already ended span");
      expect(errors[1]).toContain("log.error");
      expect(errors[1]).toContain("already ended span");
    });

    it("should work with traceSync", () => {
      const { client } = createTestClient();

      client.traceSync("sync-op", ({ log }) => {
        log.info({ message: "Inside sync operation" });
        log.warn({ message: "Sync warning" });
      });

      // Can't easily access the span after traceSync completes,
      // but we can verify no errors were thrown
      expect(true).toBe(true);
    });
  });

  describe("edge cases and error scenarios", () => {
    it("should handle error objects without stack traces", () => {
      const { client, capturedLogs } = createTestClient();

      const errorWithoutStack = new Error("No stack");
      // biome-ignore lint/performance/noDelete: testing edge case
      delete errorWithoutStack.stack;

      client.log.error({ error: errorWithoutStack });

      expect(capturedLogs).toHaveLength(1);
      expect(capturedLogs[0]?.message).toBe("No stack");
      expect(capturedLogs[0]?.stack).toBeDefined();
    });

    it("should handle logs from multiple consumers", () => {
      const { client, capturedLogs } = createTestClient();
      const secondCapturedLogs: TelemetryLog[] = [];

      // Register a second consumer
      const secondConsumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            if (signal.type === "log") {
              secondCapturedLogs.push(signal as TelemetryLog);
            }
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };
      const unregister2 = client.registerConsumer(secondConsumer);

      client.log.info({ message: "Test" });

      expect(capturedLogs).toHaveLength(1);
      expect(secondCapturedLogs).toHaveLength(1);
      expect(capturedLogs[0]?.message).toBe("Test");
      expect(secondCapturedLogs[0]?.message).toBe("Test");

      unregister2();
    });

    it("should handle logging after consumer unregistration", () => {
      const { client, capturedLogs, unregister } = createTestClient();

      client.log.info({ message: "Before unregister" });
      expect(capturedLogs).toHaveLength(1);

      unregister();

      client.log.info({ message: "After unregister" });
      expect(capturedLogs).toHaveLength(1);
    });

    it("should handle Date objects in attributes", () => {
      const { client, capturedLogs } = createTestClient();
      const testDate = new Date("2024-01-01T00:00:00Z");

      client.log.info({
        message: "Test",
        attributes: {
          timestamp: testDate,
          nested: {
            createdAt: testDate,
            array: [testDate, new Date("2024-12-31T23:59:59Z")],
          },
        },
      });

      expect(capturedLogs).toHaveLength(1);
      const attrs = capturedLogs[0]?.attributes;
      expect(attrs?.timestamp).toBeDefined();
      expect(attrs?.nested).toBeDefined();
    });

    it("should handle BigInt values in attributes", () => {
      const { client, capturedLogs } = createTestClient();

      client.log.info({
        message: "Test",
        attributes: {
          bigNumber: BigInt("9007199254740993"), // larger than MAX_SAFE_INTEGER
          negativeBig: BigInt("-9007199254740993"),
        },
      });

      expect(capturedLogs).toHaveLength(1);
    });
    it("should handle null and undefined values in attributes", () => {
      const { client, capturedLogs } = createTestClient();

      client.log.info({
        message: "Test",
        attributes: {
          nullValue: null,
          undefinedValue: undefined,
          validValue: "test",
          nestedNull: { inner: null },
        },
      });

      expect(capturedLogs).toHaveLength(1);
      const attrs = capturedLogs[0]?.attributes;
      expect(attrs?.validValue).toBeDefined();
      expect(attrs?.nestedNull).toBeDefined();
    });

    it("should handle circular references in attributes", () => {
      const { client, capturedLogs } = createTestClient();

      const circular: any = { a: 1 };
      circular.self = circular;

      client.log.info({
        message: "Test",
        attributes: { circular },
      });

      expect(capturedLogs).toHaveLength(1);
    });

    it("should handle very large messages and attributes", () => {
      const { client, capturedLogs } = createTestClient();

      const largeMessage = "x".repeat(10_000);
      const largeAttribute = "y".repeat(50_000);

      client.log.info({
        message: largeMessage,
        attributes: {
          huge: largeAttribute,
          array: new Array(1000).fill("data"),
        },
      });

      expect(capturedLogs).toHaveLength(1);
      expect(capturedLogs[0]?.message).toBe(largeMessage);
    });

    it("should handle missing message and error", () => {
      const { client, capturedLogs } = createTestClient();

      client.log.info({} as any);

      expect(capturedLogs).toHaveLength(2);

      expect(capturedLogs[0]?.message).toBe(
        "No message provided in log input or error. This is unexpected and must be fixed.",
      );
      expect(capturedLogs[0]?.level).toBe("error");

      expect(capturedLogs[1]?.message).toBe("No message provided.");
      expect(capturedLogs[1]?.level).toBe("info");
    });

    it("should extract message from error when no message provided", () => {
      const { client, capturedLogs } = createTestClient();

      client.log.error({ error: new Error("Error message only") } as any);

      expect(capturedLogs).toHaveLength(1);
      expect(capturedLogs[0]?.message).toBe("Error message only");
    });

    it("should handle non-Error objects as errors", () => {
      const { client, capturedLogs } = createTestClient();

      client.log.error({
        message: "String error",
        error: "This is a string error" as any,
      });

      expect(capturedLogs).toHaveLength(1);
      expect(capturedLogs[0]?.message).toBe("String error");
      expect(capturedLogs[0]?.error).toBeDefined();
    });

    it("should handle concurrent logging", async () => {
      const { client, capturedLogs } = createTestClient();

      const promises = new Array(100)
        .fill(0)
        .map((_, i) => Promise.resolve().then(() => client.log.info({ message: `Log ${i}` })));

      await Promise.all(promises);

      expect(capturedLogs).toHaveLength(100);
      const messages = capturedLogs.map((l) => l.message).sort();
      expect(messages[0]).toBe("Log 0");
      expect(messages[99]).toBe("Log 99");
    });

    it("should handle logging within async traced operations", async () => {
      const { client } = createTestClient();

      await Promise.all([
        (async () => {
          using span = (await client.trace("op1")).start();
          span.log.info({ message: "Op1 log" });
          await new Promise((resolve) => setTimeout(resolve, 10));
          const currentSpanHandle = client.getCurrentSpan();
          const spanData = currentSpanHandle?.getData();
          expect(spanData?.name).toBe("op1");
          expect(spanData?.logs[0]?.message).toBe("Op1 log");
        })(),
        (async () => {
          using span = (await client.trace("op2")).start();
          span.log.info({ message: "Op2 log" });
          await new Promise((resolve) => setTimeout(resolve, 5));
          const currentSpanHandle = client.getCurrentSpan();
          const spanData = currentSpanHandle?.getData();
          expect(spanData?.name).toBe("op2");
          expect(spanData?.logs[0]?.message).toBe("Op2 log");
        })(),
      ]);
    });

    it("should maintain log order within spans", async () => {
      const { client } = createTestClient();

      using span = (await client.trace("test")).start();

      for (let i = 0; i < 10; i++) {
        span.log.info({ message: `Log ${i}` });
      }

      const currentSpanHandle = client.getCurrentSpan();
      const spanData = currentSpanHandle?.getData();
      expect(spanData?.logs).toHaveLength(10);
      for (let i = 0; i < 10; i++) {
        expect(spanData?.logs[i]?.message).toBe(`Log ${i}`);
      }
    });

    it("should handle Symbol and Function in attributes", () => {
      const { client, capturedLogs } = createTestClient();

      const sym = Symbol("test");
      const fn = () => "test";

      client.log.info({
        message: "Test",
        attributes: {
          symbol: sym,
          function: fn,
          object: { sym, fn },
        },
      });

      expect(capturedLogs).toHaveLength(1);
    });

    it("should handle logs from different scope clients", () => {
      const client1 = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });
      const client2 = createTelemetryClient("server", {
        watch: true,
      });

      const capturedLogs: TelemetryLog[] = [];
      const mockConsumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            if (signal.type === "log") {
              capturedLogs.push(signal as TelemetryLog);
            }
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      const unregister1 = client1.registerConsumer(mockConsumer);
      const unregister2 = client2.registerConsumer(mockConsumer);

      client1.log.info({ message: "From CLI" });
      client2.log.info({ message: "From Server" });

      expect(capturedLogs).toHaveLength(2);
      expect(capturedLogs[0]?.scope).toBe("cli");
      expect(capturedLogs[0]?.message).toBe("From CLI");
      expect(capturedLogs[1]?.scope).toBe("server");
      expect(capturedLogs[1]?.message).toBe("From Server");

      unregister1();
      unregister2();
    });

    it("should handle global attributes independently per client", () => {
      const client1 = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });
      const client2 = createTelemetryClient("server", {
        watch: false,
      });

      const capturedLogs: TelemetryLog[] = [];
      const mockConsumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            if (signal.type === "log") {
              capturedLogs.push(signal as TelemetryLog);
            }
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      client1.registerConsumer(mockConsumer);
      client2.registerConsumer(mockConsumer);

      client1.setAttribute("client1Attr", "value1");
      client2.setAttribute("client2Attr", "value2");

      client1.log.info({ message: "Test1" });
      client2.log.info({ message: "Test2" });

      const log1 = capturedLogs[0];
      const log2 = capturedLogs[1];

      expect(log1?.attributes?.client1Attr).toBe("value1");
      expect(log1?.attributes?.client2Attr).toBeUndefined();
      expect(log2?.attributes?.client2Attr).toBe("value2");
      expect(log2?.attributes?.client1Attr).toBeUndefined();
    });
  });
});
