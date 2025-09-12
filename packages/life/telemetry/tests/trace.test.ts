import { describe, expect, it, mock } from "bun:test";
import type { AsyncQueue } from "@/shared/async-queue";
import { createTelemetryClient } from "../node";
import type { TelemetryConsumer, TelemetryLog, TelemetrySignal, TelemetrySpan } from "../types";

describe("TelemetryClient - trace() and traceSync()", () => {
  function createTestClient() {
    const client = createTelemetryClient("cli", {
      command: "dev",
      args: [],
    });

    const capturedSpans: TelemetrySpan[] = [];
    const capturedLogs: TelemetryLog[] = [];

    const mockConsumer: TelemetryConsumer = {
      start: mock((queue: AsyncQueue<TelemetrySignal>) => {
        const originalPush = queue.push.bind(queue);
        queue.push = mock((signal: TelemetrySignal) => {
          if (signal.type === "span") {
            capturedSpans.push(signal as TelemetrySpan);
          } else if (signal.type === "log") {
            capturedLogs.push(signal as TelemetryLog);
          }
          return originalPush(signal);
        });
      }),
      isProcessing: mock(() => false),
    };

    const unregister = client.registerConsumer(mockConsumer);

    return { client, capturedSpans, capturedLogs, unregister };
  }

  describe("trace()", () => {
    it("should create and end a basic span", async () => {
      const { client, capturedSpans } = createTestClient();

      using span = (await client.trace("test-span")).start();
      expect(client.getCurrentSpan()?.getData().name).toBe("test-span");

      expect(capturedSpans).toHaveLength(0);

      span.end();
      expect(capturedSpans).toHaveLength(1);
      const firstSpan = capturedSpans[0];
      expect(firstSpan).toBeDefined();
      expect(firstSpan?.name).toBe("test-span");
      expect(firstSpan?.endTimestamp).toBeDefined();
    });

    it("should support nested spans (chained)", async () => {
      const { client, capturedSpans } = createTestClient();

      using span1 = (await client.trace("span1")).start();
      using span2 = (await client.trace("span2")).start();
      using span3 = (await client.trace("span3")).start();
      using span4 = (await client.trace("span4")).start();
      using span5 = (await client.trace("span5")).start();

      // Verify parent-child relationships
      const currentSpan = client.getCurrentSpan()?.getData();
      expect(currentSpan?.name).toBe("span5");
      expect(currentSpan?.parentSpanId).toBeDefined();

      // End all spans
      span5.end();
      span4.end();
      span3.end();
      span2.end();
      span1.end();

      // Verify the chain
      expect(capturedSpans).toHaveLength(5);
      expect(capturedSpans[0]?.name).toBe("span5");
      expect(capturedSpans[1]?.name).toBe("span4");
      expect(capturedSpans[2]?.name).toBe("span3");
      expect(capturedSpans[3]?.name).toBe("span2");
      expect(capturedSpans[4]?.name).toBe("span1");

      // Check parent relationships
      const capturedSpan1 = capturedSpans[4];
      const capturedSpan2 = capturedSpans[3];
      const capturedSpan3 = capturedSpans[2];
      const capturedSpan4 = capturedSpans[1];
      const capturedSpan5 = capturedSpans[0];

      expect(capturedSpan1?.parentSpanId).toBeUndefined(); // span1 has no parent
      expect(capturedSpan1).toBeDefined();
      expect(capturedSpan2).toBeDefined();
      expect(capturedSpan3).toBeDefined();
      expect(capturedSpan4).toBeDefined();
      expect(capturedSpan5).toBeDefined();
      expect(capturedSpan2?.parentSpanId).toBe(capturedSpan1?.id as string); // span2's parent is span1
      expect(capturedSpan3?.parentSpanId).toBe(capturedSpan2?.id as string); // span3's parent is span2
      expect(capturedSpan4?.parentSpanId).toBe(capturedSpan3?.id as string); // span4's parent is span3
      expect(capturedSpan5?.parentSpanId).toBe(capturedSpan4?.id as string); // span5's parent is span4
    });

    it("should support racing/parallel spans", async () => {
      const { client, capturedSpans } = createTestClient();

      // Start root span
      using root = (await client.trace("root")).start();

      // Run racing spans in parallel
      const promises = ["A", "B", "C", "D", "E"].map(async (id) => {
        using span = (await client.trace(id)).start();
        await new Promise((resolve) => setTimeout(resolve, 10));
        span.end();
      });

      await Promise.all(promises);
      root.end();

      // All racing spans should be siblings (children of root)
      const racingSpans = capturedSpans.filter((s) => ["A", "B", "C", "D", "E"].includes(s.name));
      expect(racingSpans).toHaveLength(5);

      // All should have root as parent
      const rootSpanId = capturedSpans.find((s) => s.name === "root")?.id;
      expect(rootSpanId).toBeDefined();
      for (const span of racingSpans) {
        expect(span.parentSpanId).toBe(rootSpanId as string);
      }
    });

    it("should support out-of-order start chain", async () => {
      const { client, capturedSpans } = createTestClient();

      // Create builders in one order
      const builder1 = await client.trace("span1");
      const builder2 = await client.trace("span2");
      const builder3 = await client.trace("span3");
      const builder4 = await client.trace("span4");

      // Start them in different order
      using span3 = builder3.start();
      using span1 = builder1.start();
      using span2 = builder2.start();

      // Verify current hierarchy
      expect(client.getCurrentSpan()?.getData().name).toBe("span2");

      span2.end();

      // After span2 ends, context should restore to span1
      expect(client.getCurrentSpan()?.getData().name).toBe("span1");

      using span4 = builder4.start();

      // span4 should be child of span1 (current context)
      expect(client.getCurrentSpan()?.getData().name).toBe("span4");

      span4.end();
      span1.end();
      span3.end();

      // Check relationships
      const span3Data = capturedSpans.find((s) => s.name === "span3");
      const span1Data = capturedSpans.find((s) => s.name === "span1");
      const span2Data = capturedSpans.find((s) => s.name === "span2");
      const span4Data = capturedSpans.find((s) => s.name === "span4");

      expect(span3Data?.parentSpanId).toBeUndefined(); // span3 has no parent
      expect(span3Data).toBeDefined();
      expect(span1Data).toBeDefined();
      expect(span1Data?.parentSpanId).toBe(span3Data?.id as string); // span1's parent is span3
      expect(span2Data?.parentSpanId).toBe(span1Data?.id as string); // span2's parent is span1
      expect(span4Data?.parentSpanId).toBe(span1Data?.id as string); // span4's parent is span1
    });

    it("should properly restore context when spans end", async () => {
      const { client } = createTestClient();

      // Test sync block
      {
        using _span1 = (await client.trace("span1")).start();
        expect(client.getCurrentSpan()?.getData().name).toBe("span1");
      }
      expect(client.getCurrentSpan()).toBeUndefined();

      // Test async block
      await (async () => {
        using _span2 = (await client.trace("span2")).start();
        expect(client.getCurrentSpan()?.getData().name).toBe("span2");
      })();
      expect(client.getCurrentSpan()).toBeUndefined();

      // Test early end
      using span3 = (await client.trace("span3")).start();
      expect(client.getCurrentSpan()?.getData().name).toBe("span3");
      span3.end();
      expect(client.getCurrentSpan()).toBeUndefined();

      // Test nested early end
      using span4 = (await client.trace("span4")).start();
      using span5 = (await client.trace("span5")).start();
      expect(client.getCurrentSpan()?.getData().name).toBe("span5");
      span5.end();
      expect(client.getCurrentSpan()?.getData().name).toBe("span4");
      span4.end();
      expect(client.getCurrentSpan()).toBeUndefined();
    });

    it("should handle attributes correctly", async () => {
      const { client, capturedSpans } = createTestClient();

      using span = (await client.trace("test", { initial: "value" })).start();
      span.setAttribute("dynamic", "added");
      span.setAttribute("number", 42);
      span.end();

      expect(capturedSpans).toHaveLength(1);
      const attrs = capturedSpans[0]?.attributes;
      expect(attrs).toBeDefined();
      expect(attrs?.initial).toBeDefined();
      expect(attrs?.dynamic).toBeDefined();
      expect(attrs?.number).toBeDefined();
      if (attrs?.initial && attrs?.dynamic && attrs?.number) {
        expect(attrs.initial).toBe("value");
        expect(attrs.dynamic).toBe("added");
        expect(attrs.number).toBe(42);
      }
    });

    it("should handle logs within spans", async () => {
      const { client, capturedSpans } = createTestClient();

      using span = (await client.trace("test")).start();
      span.log.info({ message: "Test log" });
      span.log.error({ error: new Error("Test error") });
      span.end();

      expect(capturedSpans).toHaveLength(1);
      const capturedSpan = capturedSpans[0];
      expect(capturedSpan).toBeDefined();
      expect(capturedSpan?.logs).toHaveLength(2);
      const log1 = capturedSpan?.logs[0];
      const log2 = capturedSpan?.logs[1];
      expect(log1).toBeDefined();
      expect(log2).toBeDefined();
      expect(log1?.level).toBe("info");
      expect(log1?.message).toBe("Test log");
      expect(log2?.level).toBe("error");
    });

    it("should prevent operations on ended spans", async () => {
      const { client } = createTestClient();
      interface ErrorLog {
        message: string;
        error?: unknown;
        attributes?: Record<string, unknown>;
      }
      const errors: ErrorLog[] = [];

      // Capture error logs
      const origError = client.log.error;
      client.log.error = mock((input: ErrorLog) => {
        errors.push(input);
        origError.call(client.log, input);
      });

      using span = (await client.trace("test")).start();
      span.end();

      // These should all trigger error logs
      span.setAttribute("key", "value");
      span.log.info({ message: "Should fail" });
      span.end(); // Double end

      expect(errors).toHaveLength(2); // setAttribute and log.info
      expect(errors[0]?.message).toContain("setAttribute");
      expect(errors[1]?.message).toContain("log.info");
    });

    it("should prevent double start", async () => {
      const { client } = createTestClient();
      interface ErrorLog {
        message: string;
        error?: unknown;
        attributes?: Record<string, unknown>;
      }
      const errors: ErrorLog[] = [];

      // Capture error logs
      const origError = client.log.error;
      client.log.error = mock((input: ErrorLog) => {
        errors.push(input);
        origError.call(client.log, input);
      });

      const builder = await client.trace("test");
      const span1 = builder.start();
      const span2 = builder.start(); // Should log error and return same handle

      expect(span1).toBe(span2);
      expect(errors).toHaveLength(1);
      expect(errors[0]?.message).toContain("already started");

      span1.end();
    });

    it("should handle Symbol.dispose correctly", async () => {
      const { client, capturedSpans } = createTestClient();

      {
        using _span = (await client.trace("test")).start();
        expect(client.getCurrentSpan()?.getData().name).toBe("test");
      } // Symbol.dispose should be called here

      expect(client.getCurrentSpan()).toBeUndefined();
      expect(capturedSpans).toHaveLength(1);
      expect(capturedSpans[0]?.endTimestamp).toBeDefined();
    });

    it("should handle complex async scenarios", async () => {
      const { client } = createTestClient();

      // Nested async/await with context preservation
      using span1 = (await client.trace("outer")).start();
      expect(client.getCurrentSpan()?.getData().name).toBe("outer");

      await Promise.all([
        (async () => {
          using _span2 = (await client.trace("inner1")).start();
          expect(client.getCurrentSpan()?.getData().name).toBe("inner1");
          await new Promise((resolve) => setTimeout(resolve, 10));
          expect(client.getCurrentSpan()?.getData().name).toBe("inner1");
        })(),
        (async () => {
          using _span3 = (await client.trace("inner2")).start();
          expect(client.getCurrentSpan()?.getData().name).toBe("inner2");
          await new Promise((resolve) => setTimeout(resolve, 5));
          expect(client.getCurrentSpan()?.getData().name).toBe("inner2");
        })(),
      ]);

      expect(client.getCurrentSpan()?.getData().name).toBe("outer");
      span1.end();
      expect(client.getCurrentSpan()).toBeUndefined();
    });
  });

  describe("traceSync()", () => {
    it("should trace synchronous operations", () => {
      const { client, capturedSpans } = createTestClient();

      const result = client.traceSync(
        "compute",
        ({ setAttribute }) => {
          setAttribute("type", "calculation");
          return 42;
        },
        { initial: "attr" },
      );

      expect(result).toBe(42);
      expect(capturedSpans).toHaveLength(1);
      expect(capturedSpans[0]?.name).toBe("compute");
      expect(capturedSpans[0]?.attributes?.initial).toBe("attr");
      expect(capturedSpans[0]?.attributes?.type).toBe("calculation");
    });

    it("should handle nested traceSync", () => {
      const { client, capturedSpans } = createTestClient();

      client.traceSync("outer", () => {
        expect(client.getCurrentSpan()?.getData().name).toBe("outer");

        const inner = client.traceSync("inner", () => {
          expect(client.getCurrentSpan()?.getData().name).toBe("inner");
          return "nested";
        });

        expect(inner).toBe("nested");
        expect(client.getCurrentSpan()?.getData().name).toBe("outer");
      });

      expect(client.getCurrentSpan()).toBeUndefined();
      expect(capturedSpans).toHaveLength(2);

      const innerSpan = capturedSpans.find((s) => s.name === "inner");
      const outerSpan = capturedSpans.find((s) => s.name === "outer");
      expect(innerSpan?.parentSpanId).toBe(outerSpan?.id as string);
    });

    it("should handle errors in traceSync", () => {
      const { client, capturedSpans } = createTestClient();

      expect(() => {
        client.traceSync("failing", () => {
          throw new Error("Test error");
        });
      }).toThrow("Test error");

      // Span should still be ended even on error
      expect(capturedSpans).toHaveLength(1);
      expect(capturedSpans[0]?.endTimestamp).toBeDefined();
      expect(client.getCurrentSpan()).toBeUndefined();
    });

    it("should support early end in traceSync", () => {
      const { client, capturedSpans } = createTestClient();

      client.traceSync("test", ({ end }) => {
        expect(client.getCurrentSpan()?.getData().name).toBe("test");
        end();
        expect(client.getCurrentSpan()).toBeUndefined();

        // Can still do work after end
        return "done";
      });

      expect(capturedSpans).toHaveLength(1);
    });

    it("should handle logs in traceSync", () => {
      const { client, capturedSpans } = createTestClient();

      client.traceSync("test", ({ log }) => {
        log.info({ message: "Sync log" });
        log.warn({ message: "Warning" });
      });

      expect(capturedSpans[0]?.logs).toHaveLength(2);
      expect(capturedSpans[0]?.logs[0]?.message).toBe("Sync log");
      expect(capturedSpans[0]?.logs[1]?.message).toBe("Warning");
    });

    it("should handle async operations spawned from traceSync", async () => {
      const { client } = createTestClient();
      let asyncContextName: string | undefined;

      client.traceSync("sync", () => {
        expect(client.getCurrentSpan()?.getData().name).toBe("sync");

        // Spawn async operation
        (async () => {
          using _span = (await client.trace("async-child")).start();
          asyncContextName = client.getCurrentSpan()?.getData().name;
        })();

        // Sync context should remain
        expect(client.getCurrentSpan()?.getData().name).toBe("sync");
      });

      // Wait for async operation
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(asyncContextName).toBe("async-child");
      expect(client.getCurrentSpan()).toBeUndefined();
    });

    it("should preserve return type", () => {
      const { client } = createTestClient();

      // Type should be inferred correctly
      const stringResult: string = client.traceSync("test1", () => "hello");
      const numberResult: number = client.traceSync("test2", () => 42);
      const objectResult: { foo: string } = client.traceSync("test3", () => ({ foo: "bar" }));

      expect(stringResult).toBe("hello");
      expect(numberResult).toBe(42);
      expect(objectResult).toEqual({ foo: "bar" });
    });
  });

  describe("trace() and traceSync() interaction", () => {
    it("should handle mixed trace and traceSync", async () => {
      const { client, capturedSpans } = createTestClient();

      using asyncSpan = (await client.trace("async-outer")).start();

      client.traceSync("sync-inner", () => {
        expect(client.getCurrentSpan()?.getData().name).toBe("sync-inner");
      });

      expect(client.getCurrentSpan()?.getData().name).toBe("async-outer");

      asyncSpan.end();

      const asyncOuter = capturedSpans.find((s) => s.name === "async-outer");
      const syncInner = capturedSpans.find((s) => s.name === "sync-inner");
      expect(syncInner?.parentSpanId).toBe(asyncOuter?.id as string);
    });

    it("should handle traceSync inside async trace", async () => {
      const { client } = createTestClient();

      using _span = (await client.trace("async")).start();

      const syncResult = client.traceSync("sync", () => {
        expect(client.getCurrentSpan()?.getData().name).toBe("sync");
        return client.getCurrentSpan()?.getData().parentSpanId;
      });

      expect(syncResult).toBeDefined();
      expect(client.getCurrentSpan()?.getData().name).toBe("async");
    });
  });

  describe("edge cases and error scenarios", () => {
    it("should handle rapid span creation/destruction", async () => {
      const { client, capturedSpans } = createTestClient();

      for (let i = 0; i < 100; i++) {
        // biome-ignore lint/performance/noAwaitInLoops: reason
        using span = (await client.trace(`span-${i}`)).start();
        span.end();
      }

      expect(capturedSpans).toHaveLength(100);
      expect(client.getCurrentSpan()).toBeUndefined();
    });

    it("should handle deeply nested spans", async () => {
      const { client, capturedSpans } = createTestClient();
      const depth = 50;
      const handles: any[] = [];

      // Create deeply nested spans
      for (let i = 0; i < depth; i++) {
        // biome-ignore lint/performance/noAwaitInLoops: reason
        const span = (await client.trace(`level-${i}`)).start();
        handles.push(span);
      }

      // End them in reverse order
      for (let i = depth - 1; i >= 0; i--) {
        handles[i].end();
      }

      expect(capturedSpans).toHaveLength(depth);
      expect(client.getCurrentSpan()).toBeUndefined();
    });

    it("should handle concurrent trace() calls", async () => {
      const { client } = createTestClient();

      // Create multiple trace builders concurrently
      const builders = await Promise.all([
        client.trace("span1"),
        client.trace("span2"),
        client.trace("span3"),
      ]);

      // Start them
      const spans = builders.map((b) => b.start());

      // They should all exist
      expect(client.getCurrentSpan()?.getData().name).toBe("span3"); // Last started

      // Clean up
      for (const span of spans) {
        span.end();
      }
    });

    it("should maintain trace ID across spans", async () => {
      const { client, capturedSpans } = createTestClient();

      using root = (await client.trace("root")).start();
      const rootSpan = client.getCurrentSpan()?.getData();
      const traceId = rootSpan?.traceId;

      using child1 = (await client.trace("child1")).start();
      using child2 = (await client.trace("child2")).start();

      child2.end();
      child1.end();
      root.end();

      // All spans should share the same trace ID
      expect(capturedSpans.every((s) => s.traceId === traceId)).toBe(true);
    });

    it("should handle span ending after parent already ended gracefully", async () => {
      const { client, capturedSpans } = createTestClient();

      using parent = (await client.trace("parent")).start();
      using child = (await client.trace("child")).start();

      // End parent first
      parent.end();

      // End child after parent - should work without errors in current implementation
      child.end();

      // Both spans should be captured successfully
      expect(capturedSpans).toHaveLength(2);
      const parentSpan = capturedSpans.find((s) => s.name === "parent");
      const childSpan = capturedSpans.find((s) => s.name === "child");

      expect(parentSpan).toBeDefined();
      expect(childSpan).toBeDefined();
      expect(childSpan?.parentSpanId).toBe(parentSpan?.id as string);
    });

    it("should handle null/undefined attributes gracefully", async () => {
      const { client, capturedSpans } = createTestClient();

      using span = (
        await client.trace("test", {
          nullValue: null,
          undefinedValue: undefined,
          validValue: "test",
        })
      ).start();

      span.setAttribute("anotherNull", null);
      span.setAttribute("anotherUndefined", undefined);
      span.end();

      expect(capturedSpans).toHaveLength(1);
      const attrs = capturedSpans[0]?.attributes;
      expect(attrs).toBeDefined();
      // Canon should serialize null/undefined values appropriately
      expect(attrs?.validValue).toBeDefined();
    });

    it("should handle circular references in attributes", async () => {
      const { client, capturedSpans } = createTestClient();

      const circular: any = { a: 1 };
      circular.self = circular;

      using span = (await client.trace("test")).start();
      span.setAttribute("circular", circular);
      span.end();

      expect(capturedSpans).toHaveLength(1);
      // Should not throw and should serialize safely
    });

    it("should handle very long span names and attribute values", async () => {
      const { client, capturedSpans } = createTestClient();

      const longName = "a".repeat(1000);
      const longValue = "b".repeat(10_000);

      using span = (await client.trace(longName)).start();
      span.setAttribute("longKey", longValue);
      span.end();

      expect(capturedSpans).toHaveLength(1);
      expect(capturedSpans[0]?.name).toBe(longName);
    });

    it("should handle span context across Promise boundaries", async () => {
      const { client } = createTestClient();

      using span1 = (await client.trace("span1")).start();

      const promise = new Promise<string>((resolve) => {
        setTimeout(() => {
          // Context should still be span1
          expect(client.getCurrentSpan()?.getData().name).toBe("span1");
          resolve(client.getCurrentSpan()?.getData().name || "none");
        }, 10);
      });

      const result = await promise;
      expect(result).toBe("span1");
      span1.end();
    });

    it("should handle span ending in different async context", async () => {
      const { client, capturedSpans } = createTestClient();

      const { start } = await client.trace("test");
      let spanHandle: any;

      // Start span in one async context
      await Promise.resolve().then(() => {
        spanHandle = start();
      });

      // End span in different async context
      await Promise.resolve().then(() => {
        spanHandle.end();
      });

      expect(capturedSpans).toHaveLength(1);
      expect(capturedSpans[0]?.endTimestamp).toBeDefined();
    });
  });
});
