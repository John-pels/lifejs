import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestContext, TestHelpers } from "./utils";
import { createTestHelpers } from "./utils";

export function createLoggingTests(context: TestContext) {
  describe("TelemetryClient - Logging", () => {
    let helpers: TestHelpers;

    beforeEach(() => {
      helpers = createTestHelpers(context.createClient());
    });

    afterEach(() => {
      helpers.unregister();
    });

    describe("Log Levels", () => {
      it("should log at all severity levels", () => {
        const { client, capturedLogs } = helpers;

        client.log.debug({ message: "Debug message" });
        client.log.info({ message: "Info message" });
        client.log.warn({ message: "Warning message" });
        client.log.error({ message: "Error message" });
        client.log.fatal({ message: "Fatal message" });

        expect(capturedLogs).toHaveLength(5);
        expect(capturedLogs[0]).toMatchObject({ level: "debug", message: "Debug message" });
        expect(capturedLogs[1]).toMatchObject({ level: "info", message: "Info message" });
        expect(capturedLogs[2]).toMatchObject({ level: "warn", message: "Warning message" });
        expect(capturedLogs[3]).toMatchObject({ level: "error", message: "Error message" });
        expect(capturedLogs[4]).toMatchObject({ level: "fatal", message: "Fatal message" });
      });

      it("should include timestamp in logs", () => {
        const { client, capturedLogs } = helpers;

        client.log.info({ message: "Test" });

        // Timestamp should be a bigint representing nanoseconds
        expect(capturedLogs[0]?.timestamp).toBeDefined();
        expect(typeof capturedLogs[0]?.timestamp).toBe("bigint");
        expect(capturedLogs[0]?.timestamp).toBeGreaterThan(0n);
      });
    });

    describe("Error Handling", () => {
      it("should extract message from error object", () => {
        const { client, capturedLogs } = helpers;
        const error = new Error("Test error message");

        client.log.error({ error });

        expect(capturedLogs[0]).toMatchObject({
          level: "error",
          message: "Test error message",
          error,
        });
      });

      it("should include stack trace", () => {
        const { client, capturedLogs } = helpers;
        const error = new Error("Stack trace test");

        client.log.error({ error });

        expect(capturedLogs[0]?.stack).toBeDefined();
        expect(capturedLogs[0]?.stack).toContain("Error");
      });

      it("should handle error with custom message", () => {
        const { client, capturedLogs } = helpers;
        const error = new Error("Original error");

        client.log.error({
          message: "Custom error message",
          error,
        });

        expect(capturedLogs[0]).toMatchObject({
          level: "error",
          message: "Custom error message",
          error,
        });
      });

      it("should handle non-Error objects", () => {
        const { client, capturedLogs } = helpers;

        client.log.error({
          message: "String error",
          error: "Something went wrong" as unknown,
        });

        expect(capturedLogs[0]).toMatchObject({
          level: "error",
          message: "String error",
        });
      });
    });

    describe("Log Attributes", () => {
      it("should include custom attributes", () => {
        const { client, capturedLogs } = helpers;

        client.log.info({
          message: "User action",
          attributes: {
            userId: "123",
            action: "login",
            ip: "192.168.1.1",
          },
        });

        expect(capturedLogs[0]).toMatchObject({
          message: "User action",
          attributes: {
            userId: "123",
            action: "login",
            ip: "192.168.1.1",
          },
        });
      });

      it("should merge client attributes with log attributes", () => {
        const { client, capturedLogs } = helpers;

        client.setAttribute("app", "test-app");
        client.setAttributes({ version: "1.0.0" });

        client.log.info({
          message: "Test",
          attributes: { custom: "value" },
        });

        expect(capturedLogs[0]?.attributes).toMatchObject({
          app: "test-app",
          version: "1.0.0",
          custom: "value",
        });
      });

      it("should handle undefined attributes", () => {
        const { client, capturedLogs } = helpers;

        client.log.info({ message: "No attributes" });

        expect(capturedLogs[0]).toBeDefined();
        expect(capturedLogs[0]?.message).toBe("No attributes");
      });
    });

    describe("Log Context", () => {
      it("should associate logs with current span", () => {
        const { client, capturedLogs, capturedSpans } = helpers;

        client.trace("operation", ({ log }) => {
          log.info({ message: "Inside span" });
          log.warn({ message: "Warning in span" });
        });

        expect(capturedSpans).toHaveLength(1);
        expect(capturedLogs).toHaveLength(2);

        const span = capturedSpans[0];
        expect(capturedLogs[0]?.spanId).toBe(span?.id);
        expect(capturedLogs[1]?.spanId).toBe(span?.id);
        expect(capturedLogs[0]?.traceId).toBe(span?.traceId);
        expect(capturedLogs[1]?.traceId).toBe(span?.traceId);
      });

      it("should add logs to span.logs array", () => {
        const { client, capturedSpans } = helpers;

        client.trace("operation", ({ log }) => {
          log.debug({ message: "Debug" });
          log.info({ message: "Info" });
          log.error({ message: "Error" });
        });

        const span = capturedSpans[0];
        expect(span?.logs).toHaveLength(3);
        expect(span?.logs[0]).toMatchObject({ level: "debug", message: "Debug" });
        expect(span?.logs[1]).toMatchObject({ level: "info", message: "Info" });
        expect(span?.logs[2]).toMatchObject({ level: "error", message: "Error" });
      });

      it("should handle logs outside of span context", () => {
        const { client, capturedLogs } = helpers;

        client.log.info({ message: "Outside span" });

        expect(capturedLogs[0]).toBeDefined();
        expect(capturedLogs[0]?.spanId).toBeUndefined();
        expect(capturedLogs[0]?.traceId).toBeUndefined();
      });

      it("should not allow logging after span ends", () => {
        const { client, capturedSpans, capturedLogs } = helpers;

        let spanHandle: ReturnType<typeof client.getCurrentSpan>;
        client.trace("operation", (handle) => {
          spanHandle = handle;
          handle.end();
        });

        // Try to log after span ended
        spanHandle?.log.info({ message: "After end" });

        // Log should not be added to span.logs
        const span = capturedSpans[0];
        expect(span?.logs).toHaveLength(0);

        // But an error log should be created about the attempt
        const errorLog = capturedLogs.find((log) =>
          log.message.includes("Attempted to call 'log.info()' on already ended span"),
        );
        expect(errorLog).toBeDefined();
      });
    });

    describe("Message Formatting", () => {
      it("should strip ANSI codes from messageUnstyled", () => {
        const { client, capturedLogs } = helpers;

        // Simulate colored terminal output
        client.log.info({ message: "\x1b[31mRed Text\x1b[0m" });

        expect(capturedLogs[0]?.message).toBe("\x1b[31mRed Text\x1b[0m");
        expect(capturedLogs[0]?.messageUnstyled).toBe("Red Text");
      });

      it("should handle empty message", () => {
        const { client } = helpers;

        expect(() => {
          client.log.info({ message: "" });
        }).toThrow(
          "No message provided in log input or error. This is unexpected and must be fixed.",
        );
      });

      it("should handle multiline messages", () => {
        const { client, capturedLogs } = helpers;

        const multiline = "Line 1\nLine 2\nLine 3";
        client.log.info({ message: multiline });

        expect(capturedLogs[0]?.message).toBe(multiline);
        expect(capturedLogs[0]?.messageUnstyled).toBe(multiline);
      });
    });

    describe("Resource and Scope", () => {
      it("should include resource information", () => {
        const { client, capturedLogs } = helpers;

        client.log.info({ message: "Test" });

        expect(capturedLogs[0]?.resource).toBeDefined();
        expect(capturedLogs[0]?.resource.platform).toBe(context.expectedPlatform);
      });

      it("should include scope", () => {
        const { client, capturedLogs } = helpers;

        client.log.info({ message: "Test" });

        expect(capturedLogs[0]?.scope).toBeDefined();
        expect(typeof capturedLogs[0]?.scope).toBe("string");
      });
    });
  });
}
