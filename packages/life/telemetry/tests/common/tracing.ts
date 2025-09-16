// biome-ignore-all lint: test file

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestContext, TestHelpers } from "./utils";
import { createTestHelpers, delay } from "./utils";

export function createTracingTests(context: TestContext) {
  describe("TelemetryClient - Tracing", () => {
    let helpers: TestHelpers;

    beforeEach(() => {
      helpers = createTestHelpers(context.createClient());
    });

    afterEach(() => {
      helpers.unregister();
    });

    describe("Basic Tracing", () => {
      it("should trace synchronous function", () => {
        const { client, capturedSpans } = helpers;

        const result = client.trace("sync-operation", ({ setAttribute }) => {
          setAttribute("type", "sync");
          // Do some work to ensure measurable duration
          const start = Date.now();
          while (Date.now() - start < 2) {
            // Busy wait for 2ms to ensure measurable duration
          }
          return "sync-result";
        });

        expect(result).toBe("sync-result");
        expect(capturedSpans).toHaveLength(1);
        expect(capturedSpans[0]).toMatchObject({
          name: "sync-operation",
          attributes: { type: "sync" },
        });
        expect(capturedSpans[0]?.endTimestamp).toBeGreaterThan(0);
        expect(capturedSpans[0]?.duration).toBeGreaterThan(0);
      });

      it("should trace async function", async () => {
        const { client, capturedSpans } = helpers;

        const result = await client.trace("async-operation", async ({ setAttribute }) => {
          await delay(10);
          setAttribute("type", "async");
          return "async-result";
        });

        expect(result).toBe("async-result");
        expect(capturedSpans).toHaveLength(1);
        expect(capturedSpans[0]).toMatchObject({
          name: "async-operation",
          attributes: { type: "async" },
        });
        expect(capturedSpans[0]?.endTimestamp).toBeGreaterThan(0);
        expect(capturedSpans[0]?.duration).toBeGreaterThan(0);
      });

      it("should preserve function return types", () => {
        const { client } = helpers;

        // Sync function returns direct value
        const syncResult: string = client.trace("sync", () => "value");
        expect(syncResult).toBe("value");

        // Async function returns Promise
        const asyncResult: Promise<string> = client.trace("async", async () => {
          await delay(1);
          return "value";
        });
        expect(asyncResult).toBeInstanceOf(Promise);
      });

      it("should generate unique span IDs", () => {
        const { client, capturedSpans } = helpers;

        client.trace("span1", () => {});
        client.trace("span2", () => {});
        client.trace("span3", () => {});

        expect(capturedSpans).toHaveLength(3);
        const ids = capturedSpans.map((s) => s.id);
        expect(new Set(ids).size).toBe(3); // All IDs should be unique
      });

      it("should measure duration accurately", async () => {
        const { client, capturedSpans } = helpers;
        const delayMs = 50;

        await client.trace("timed-operation", async () => {
          await delay(delayMs);
        });

        const span = capturedSpans[0];
        expect(span?.duration).toBeDefined();
        // Duration should be at least the delay (with some tolerance)
        expect(Number(span?.duration! / 1_000_000n)).toBeGreaterThanOrEqual(delayMs - 5);
      });
    });

    describe("Span Attributes", () => {
      it("should set single attribute", () => {
        const { client, capturedSpans } = helpers;

        client.trace("test", ({ setAttribute }) => {
          setAttribute("key", "value");
          setAttribute("number", 42);
          setAttribute("boolean", true);
        });

        expect(capturedSpans[0]?.attributes).toMatchObject({
          key: "value",
          number: 42,
          boolean: true,
        });
      });

      it("should set multiple attributes", () => {
        const { client, capturedSpans } = helpers;

        client.trace("test", ({ setAttributes }) => {
          setAttributes({
            key1: "value1",
            key2: "value2",
            nested: { object: "value" },
            array: [1, 2, 3],
          });
        });

        expect(capturedSpans[0]?.attributes).toMatchObject({
          key1: "value1",
          key2: "value2",
          nested: { object: "value" },
          array: [1, 2, 3],
        });
      });

      it("should merge initial attributes with set attributes", () => {
        const { client, capturedSpans } = helpers;

        client.trace(
          "test",
          ({ setAttribute, setAttributes }) => {
            setAttribute("runtime", "value");
            setAttributes({ bulk1: "v1", bulk2: "v2" });
          },
          { attributes: { initial: "value", override: "original" } },
        );

        expect(capturedSpans[0]?.attributes).toMatchObject({
          initial: "value",
          override: "original",
          runtime: "value",
          bulk1: "v1",
          bulk2: "v2",
        });
      });

      it("should include client attributes", () => {
        const { client, capturedSpans } = helpers;

        client.setAttribute("global", "attribute");
        client.trace("test", () => {});

        expect(capturedSpans[0]?.attributes).toMatchObject({
          global: "attribute",
        });
      });

      it("should not set attributes after span ends", () => {
        const { client, capturedSpans, capturedLogs } = helpers;

        client.trace("test", ({ end, setAttribute, setAttributes }) => {
          setAttribute("before", "end");
          end();
          setAttribute("after", "end");
          setAttributes({ also: "after" });
        });

        expect(capturedSpans[0]?.attributes).toMatchObject({ before: "end" });
        expect(capturedSpans[0]?.attributes?.after).toBeUndefined();
        expect(capturedSpans[0]?.attributes?.also).toBeUndefined();

        // Should log errors about attempts to set attributes after end
        const errors = capturedLogs.filter(
          (log) =>
            log.message.includes("Attempted to call") &&
            log.message.includes("on already ended span"),
        );
        expect(errors.length).toBeGreaterThan(0);
      });
    });

    describe("Early Span End", () => {
      it("should support manual early end", () => {
        const { client, capturedSpans } = helpers;

        client.trace("early-end", ({ end, setAttribute }) => {
          setAttribute("step", "1");
          end();
          // Code after end still executes but span is closed
          setAttribute("step", "2"); // This won't be added
        });

        expect(capturedSpans).toHaveLength(1);
        expect(capturedSpans[0]?.attributes?.step).toBe("1");
      });

      it("should handle multiple end calls gracefully", () => {
        const { client, capturedSpans } = helpers;

        client.trace("multi-end", ({ end }) => {
          end();
          end(); // Second call should be ignored
          end(); // Third call should be ignored
        });

        expect(capturedSpans).toHaveLength(1);
        expect(capturedSpans[0]?.endTimestamp).toBeGreaterThan(0);
      });
    });

    describe("Error Handling", () => {
      it("should end span even if sync function throws", () => {
        const { client, capturedSpans } = helpers;

        expect(() =>
          client.trace("error-sync", () => {
            throw new Error("Sync error");
          }),
        ).toThrow("Sync error");

        expect(capturedSpans).toHaveLength(1);
        expect(capturedSpans[0]?.endTimestamp).toBeGreaterThan(0);
      });

      it("should end span even if async function rejects", async () => {
        const { client, capturedSpans } = helpers;

        await expect(
          client.trace("error-async", async () => {
            await delay(10);
            throw new Error("Async error");
          }),
        ).rejects.toThrow("Async error");

        expect(capturedSpans).toHaveLength(1);
        expect(capturedSpans[0]?.endTimestamp).toBeGreaterThan(0);
      });

      it("should handle errors in setAttribute", () => {
        const { client, capturedSpans } = helpers;

        client.trace("test", ({ setAttribute }) => {
          // Simulate an error in setAttribute (circular reference)
          const circular: any = { self: null };
          circular.self = circular;
          setAttribute("circular", circular);
        });

        // Span should still complete
        expect(capturedSpans).toHaveLength(1);
        expect(capturedSpans[0]?.endTimestamp).toBeGreaterThan(0);
      });
    });

    describe("Explicit Parent Spans", () => {
      it("should create hierarchy with explicit parent", () => {
        const { client, capturedSpans } = helpers;

        client.trace("parent", (parentHandle) => {
          client.trace(
            "child",
            () => {
              // Child span work
            },
            { parent: parentHandle },
          );
        });

        expect(capturedSpans).toHaveLength(2);
        const [childSpan, parentSpan] = capturedSpans;

        expect(childSpan?.name).toBe("child");
        expect(parentSpan?.name).toBe("parent");
        expect(childSpan?.parentSpanId).toBe(parentSpan?.id);
        expect(childSpan?.traceId).toBe(parentSpan?.traceId);
      });

      it("should handle async functions with explicit parent", async () => {
        const { client, capturedSpans } = helpers;

        await client.trace("parent", async (parentHandle) => {
          await delay(10);

          await client.trace(
            "child1",
            async () => {
              await delay(10);
            },
            { parent: parentHandle },
          );

          await client.trace(
            "child2",
            async () => {
              await delay(10);
            },
            { parent: parentHandle },
          );
        });

        expect(capturedSpans).toHaveLength(3);
        const [child1, child2, parent] = capturedSpans;

        expect(parent?.name).toBe("parent");
        expect(child1?.name).toBe("child1");
        expect(child2?.name).toBe("child2");
        expect(child1?.parentSpanId).toBe(parent?.id);
        expect(child2?.parentSpanId).toBe(parent?.id);
      });

      it("should create sibling spans with same parent", () => {
        const { client, capturedSpans } = helpers;

        client.trace("root", (rootHandle) => {
          client.trace("sibling1", () => {}, { parent: rootHandle });
          client.trace("sibling2", () => {}, { parent: rootHandle });
          client.trace("sibling3", () => {}, { parent: rootHandle });
        });

        expect(capturedSpans).toHaveLength(4);
        const [s1, s2, s3, root] = capturedSpans;

        expect(s1?.parentSpanId).toBe(root?.id);
        expect(s2?.parentSpanId).toBe(root?.id);
        expect(s3?.parentSpanId).toBe(root?.id);
        expect(s1?.traceId).toBe(root?.traceId);
        expect(s2?.traceId).toBe(root?.traceId);
        expect(s3?.traceId).toBe(root?.traceId);
      });

      it("should handle deep nesting with explicit parents", () => {
        const { client, capturedSpans } = helpers;

        client.trace("level1", (l1) => {
          client.trace(
            "level2",
            (l2) => {
              client.trace(
                "level3",
                (l3) => {
                  client.trace("level4", () => {}, { parent: l3 });
                },
                { parent: l2 },
              );
            },
            { parent: l1 },
          );
        });

        expect(capturedSpans).toHaveLength(4);
        const [l4, l3, l2, l1] = capturedSpans;

        expect(l1?.parentSpanId).toBeUndefined();
        expect(l2?.parentSpanId).toBe(l1?.id);
        expect(l3?.parentSpanId).toBe(l2?.id);
        expect(l4?.parentSpanId).toBe(l3?.id);

        // All should share the same trace ID
        const traceId = l1?.traceId;
        expect(l2?.traceId).toBe(traceId);
        expect(l3?.traceId).toBe(traceId);
        expect(l4?.traceId).toBe(traceId);
      });
    });

    describe("Trace IDs", () => {
      it("should generate new trace ID for root spans", () => {
        const { client, capturedSpans } = helpers;

        client.trace("trace1", () => {});
        client.trace("trace2", () => {});

        expect(capturedSpans).toHaveLength(2);
        expect(capturedSpans[0]?.traceId).toBeDefined();
        expect(capturedSpans[1]?.traceId).toBeDefined();
        expect(capturedSpans[0]?.traceId).not.toBe(capturedSpans[1]?.traceId);
      });

      it("should propagate trace ID to child spans", () => {
        const { client, capturedSpans } = helpers;

        client.trace("parent", (parentHandle) => {
          client.trace("child1", () => {}, { parent: parentHandle });
          client.trace("child2", () => {}, { parent: parentHandle });
        });

        const traceId = capturedSpans[2]?.traceId; // Parent span
        expect(capturedSpans[0]?.traceId).toBe(traceId); // Child1
        expect(capturedSpans[1]?.traceId).toBe(traceId); // Child2
      });
    });

    describe("Span Data Access", () => {
      it("should provide getData method", () => {
        const { client } = helpers;

        client.trace("test", ({ getData }) => {
          const data = getData();
          expect(data).toBeDefined();
          expect(data.name).toBe("test");
          expect(data.id).toBeDefined();
          expect(data.traceId).toBeDefined();
          expect(data.startTimestamp).toBeGreaterThan(0);
        });
      });

      it("should return cloned data to prevent mutations", () => {
        const { client, capturedSpans } = helpers;

        client.trace("test", ({ getData, setAttribute }) => {
          const data1 = getData();
          setAttribute("key", "value");
          const data2 = getData();

          // @ts-expect-error -Modifying returned data should not affect actual span
          data1.name = "modified";
          expect(data2.name).toBe("test");
        });

        expect(capturedSpans[0]?.name).toBe("test");
      });
    });

    describe("Unwaited Async Functions", () => {
      it("should handle sync function starting unwaited async", async () => {
        const { client, capturedSpans, waitForSignals } = helpers;

        client.trace("sync-parent", () => {
          // Start async operation without awaiting
          client.trace("async-child", async () => {
            await delay(50);
          });
          // Sync parent ends immediately
        });

        // Wait for both spans to complete
        await waitForSignals(2);

        expect(capturedSpans).toHaveLength(2);
        // Both spans should be properly ended
        expect(capturedSpans[0]?.endTimestamp).toBeGreaterThan(0);
        expect(capturedSpans[1]?.endTimestamp).toBeGreaterThan(0);
      });

      it("should handle async function starting unwaited async", async () => {
        const { client, capturedSpans, waitForSignals } = helpers;

        await client.trace("async-parent", async () => {
          // Start async operation without awaiting
          client.trace("async-child", async () => {
            await delay(100);
          });
          // Parent completes before child
          await delay(20);
        });

        // Wait for child to complete
        await waitForSignals(2);

        expect(capturedSpans).toHaveLength(2);

        // Find spans by name since order might vary
        const parent = capturedSpans.find((s) => s.name === "async-parent");
        const child = capturedSpans.find((s) => s.name === "async-child");

        // Parent should end before child (since child takes 100ms and parent takes 20ms)
        expect(parent).toBeDefined();
        expect(child).toBeDefined();
        expect(parent?.endTimestamp).toBeLessThan(child?.endTimestamp || 0);
      });

      it("should handle multiple unwaited async operations", async () => {
        const { client, capturedSpans, waitForSignals } = helpers;

        client.trace("parent", () => {
          // Start multiple async operations without awaiting
          for (let i = 0; i < 3; i++) {
            client.trace(`async-${i}`, async () => {
              await delay(20 * (i + 1));
            });
          }
        });

        // Wait for all spans
        await waitForSignals(4);

        expect(capturedSpans).toHaveLength(4);
        // All spans should be ended
        capturedSpans.forEach((span) => {
          expect(span.endTimestamp).toBeGreaterThan(0);
        });
      });
    });

    describe("Mixed Sync/Async Combinations", () => {
      it("should handle sync within async", async () => {
        const { client, capturedSpans } = helpers;

        await client.trace("async-parent", async () => {
          await delay(10);
          client.trace("sync-child", () => {
            // Sync work
          });
          await delay(10);
        });

        expect(capturedSpans).toHaveLength(2);
        const [syncChild, asyncParent] = capturedSpans;

        expect(syncChild?.name).toBe("sync-child");
        expect(asyncParent?.name).toBe("async-parent");
      });

      it("should handle async within sync with explicit parent", async () => {
        const { client, capturedSpans, waitForSignals } = helpers;

        client.trace("sync-parent", (parentHandle) => {
          // Start async with explicit parent
          client.trace(
            "async-child",
            async () => {
              await delay(50);
            },
            { parent: parentHandle },
          );
        });

        await waitForSignals(2);

        expect(capturedSpans).toHaveLength(2);

        // Find spans by name since order might vary
        const syncParent = capturedSpans.find((s) => s.name === "sync-parent");
        const asyncChild = capturedSpans.find((s) => s.name === "async-child");

        expect(asyncChild).toBeDefined();
        expect(syncParent).toBeDefined();
        expect(asyncChild?.parentSpanId).toBe(syncParent?.id);
      });

      it("should handle complex nested mix", async () => {
        const { client, capturedSpans } = helpers;

        await client.trace("async-root", async () => {
          await delay(10);

          client.trace("sync-child1", () => {
            // Nested sync in sync
            client.trace("sync-grandchild", () => {});
          });

          await client.trace("async-child2", async () => {
            await delay(10);
            // Sync in async
            client.trace("sync-in-async", () => {});
          });
        });

        expect(capturedSpans).toHaveLength(5);
        // Verify all spans completed
        capturedSpans.forEach((span) => {
          expect(span.endTimestamp).toBeGreaterThan(0);
        });
      });
    });

    // Node.js specific tests - AsyncLocalStorage Context
    describe.skipIf(!context.supportsSpanHierarchy)("AsyncLocalStorage Context (Node.js)", () => {
      it("should maintain context through nested spans", () => {
        const { client, capturedSpans } = helpers;

        client.trace("level1", () => {
          client.trace("level2", () => {
            client.trace("level3", () => {
              // Verify context is maintained
              const currentSpan = client.getCurrentSpan();
              expect(currentSpan?.getData().name).toBe("level3");
            });
          });
        });

        expect(capturedSpans).toHaveLength(3);
        const [l3, l2, l1] = capturedSpans;

        // Verify parent-child relationships via context
        expect(l1?.parentSpanId).toBeUndefined();
        expect(l2?.parentSpanId).toBe(l1?.id);
        expect(l3?.parentSpanId).toBe(l2?.id);
      });

      it("should isolate context between parallel async operations", async () => {
        const { client, capturedSpans } = helpers;
        const results: string[] = [];

        // Start two parallel async operations
        const promise1 = client.trace("async1", async () => {
          await delay(10);
          const span = client.getCurrentSpan();
          results.push(span?.getData().name || "none");

          await client.trace("async1-child", async () => {
            await delay(10);
            const span = client.getCurrentSpan();
            results.push(span?.getData().name || "none");
          });
        });

        const promise2 = client.trace("async2", async () => {
          await delay(5);
          const span = client.getCurrentSpan();
          results.push(span?.getData().name || "none");

          await client.trace("async2-child", async () => {
            await delay(5);
            const span = client.getCurrentSpan();
            results.push(span?.getData().name || "none");
          });
        });

        await Promise.all([promise1, promise2]);

        // Each async operation should maintain its own context
        expect(results).toContain("async1");
        expect(results).toContain("async1-child");
        expect(results).toContain("async2");
        expect(results).toContain("async2-child");

        expect(capturedSpans).toHaveLength(4);

        // Verify proper parent-child relationships
        const async1 = capturedSpans.find((s) => s.name === "async1");
        const async1Child = capturedSpans.find((s) => s.name === "async1-child");
        const async2 = capturedSpans.find((s) => s.name === "async2");
        const async2Child = capturedSpans.find((s) => s.name === "async2-child");

        expect(async1Child?.parentSpanId).toBe(async1?.id);
        expect(async2Child?.parentSpanId).toBe(async2?.id);
      });

      it("should handle context in setTimeout callbacks", async () => {
        const { client, capturedSpans } = helpers;

        await new Promise<void>((resolve) => {
          client.trace("outer", () => {
            setTimeout(() => {
              // Context is actually maintained in Node.js with AsyncLocalStorage
              client.trace("timeout-span", () => {
                resolve();
              });
            }, 10);
          });
        });

        expect(capturedSpans).toHaveLength(2);
        const outer = capturedSpans.find((s) => s.name === "outer");
        const timeoutSpan = capturedSpans.find((s) => s.name === "timeout-span");

        // In Node.js, context IS maintained through setTimeout
        expect(timeoutSpan?.parentSpanId).toBe(outer?.id);
        expect(timeoutSpan?.traceId).toBe(outer?.traceId);
      });

      it("should handle context in setImmediate callbacks", async () => {
        const { client, capturedSpans } = helpers;

        await new Promise<void>((resolve) => {
          client.trace("outer", () => {
            setImmediate(() => {
              // Context is maintained in Node.js with AsyncLocalStorage
              client.trace("immediate-span", () => {
                resolve();
              });
            });
          });
        });

        expect(capturedSpans).toHaveLength(2);
        const outer = capturedSpans.find((s) => s.name === "outer");
        const immediateSpan = capturedSpans.find((s) => s.name === "immediate-span");

        // In Node.js, context IS maintained through setImmediate
        expect(immediateSpan?.parentSpanId).toBe(outer?.id);
        expect(immediateSpan?.traceId).toBe(outer?.traceId);
      });

      it("should handle context in Promise chains", async () => {
        const { client, capturedSpans } = helpers;

        await client.trace("chain-start", async () => {
          await Promise.resolve()
            .then(() => client.trace("then1", () => delay(10)))
            .then(() => client.trace("then2", () => delay(10)))
            .then(() => client.trace("then3", () => {}));
        });

        expect(capturedSpans).toHaveLength(4);

        const chainStart = capturedSpans.find((s) => s.name === "chain-start");
        const then1 = capturedSpans.find((s) => s.name === "then1");
        const then2 = capturedSpans.find((s) => s.name === "then2");
        const then3 = capturedSpans.find((s) => s.name === "then3");

        // All should be children of chain-start
        expect(then1?.parentSpanId).toBe(chainStart?.id);
        expect(then2?.parentSpanId).toBe(chainStart?.id);
        expect(then3?.parentSpanId).toBe(chainStart?.id);

        // All share the same trace ID
        const traceId = chainStart?.traceId;
        [then1, then2, then3].forEach((span) => {
          expect(span?.traceId).toBe(traceId);
        });
      });

      it("should handle unwaited async with context", async () => {
        const { client, capturedSpans, waitForSignals } = helpers;

        client.trace("sync-parent", () => {
          // Start unwaited async - context is maintained
          client.trace("unwaited-async", async () => {
            await delay(50);
          });
        });

        await waitForSignals(2);

        expect(capturedSpans).toHaveLength(2);
        const syncParent = capturedSpans.find((s) => s.name === "sync-parent");
        const unwaitedAsync = capturedSpans.find((s) => s.name === "unwaited-async");

        // In Node.js, context is maintained even for unwaited async
        expect(unwaitedAsync?.parentSpanId).toBe(syncParent?.id);
        expect(unwaitedAsync?.traceId).toBe(syncParent?.traceId);
      });

      it("should get current span in async context", async () => {
        const { client } = helpers;
        const results: Array<string | undefined> = [];

        await client.trace("outer", async () => {
          results.push(client.getCurrentSpan()?.getData().name);

          await client.trace("inner", async () => {
            results.push(client.getCurrentSpan()?.getData().name);
          });

          results.push(client.getCurrentSpan()?.getData().name);
        });

        expect(results).toEqual(["outer", "inner", "outer"]);
      });
    });

    // Browser specific tests - Flat Span Hierarchy
    describe.skipIf(context.supportsSpanHierarchy)("Flat Span Hierarchy (Browser)", () => {
      it("should create flat hierarchy (no automatic parent-child)", () => {
        const { client, capturedSpans } = helpers;

        client.trace("outer", () => {
          client.trace("inner", () => {
            client.trace("deepest", () => {
              // In browser, getCurrentSpan returns undefined
              const currentSpan = client.getCurrentSpan();
              expect(currentSpan).toBeUndefined();
            });
          });
        });

        expect(capturedSpans).toHaveLength(3);
        const [deepest, inner, outer] = capturedSpans;

        // All spans should have no parent (flat hierarchy)
        expect(outer?.parentSpanId).toBeUndefined();
        expect(inner?.parentSpanId).toBeUndefined();
        expect(deepest?.parentSpanId).toBeUndefined();

        // Each span gets its own trace ID
        expect(outer?.traceId).toBeDefined();
        expect(inner?.traceId).toBeDefined();
        expect(deepest?.traceId).toBeDefined();
        expect(outer?.traceId).not.toBe(inner?.traceId);
        expect(inner?.traceId).not.toBe(deepest?.traceId);
      });

      it("should require explicit parent for hierarchy", () => {
        const { client, capturedSpans } = helpers;

        client.trace("parent", (parentHandle) => {
          // Must use explicit parent
          client.trace("child1", () => {}, { parent: parentHandle });
          client.trace("child2", () => {}, { parent: parentHandle });

          // Without explicit parent, no relationship
          client.trace("orphan", () => {});
        });

        expect(capturedSpans).toHaveLength(4);

        const parent = capturedSpans.find((s) => s.name === "parent");
        const child1 = capturedSpans.find((s) => s.name === "child1");
        const child2 = capturedSpans.find((s) => s.name === "child2");
        const orphan = capturedSpans.find((s) => s.name === "orphan");

        // Explicit parent relationships work
        expect(child1?.parentSpanId).toBe(parent?.id);
        expect(child2?.parentSpanId).toBe(parent?.id);
        expect(child1?.traceId).toBe(parent?.traceId);
        expect(child2?.traceId).toBe(parent?.traceId);

        // Orphan has no parent
        expect(orphan?.parentSpanId).toBeUndefined();
        expect(orphan?.traceId).not.toBe(parent?.traceId);
      });

      it("should handle async operations as independent spans", async () => {
        const { client, capturedSpans } = helpers;

        await client.trace("async-outer", async () => {
          await delay(10);

          await client.trace("async-inner", async () => {
            await delay(10);
          });
        });

        expect(capturedSpans).toHaveLength(2);
        const [inner, outer] = capturedSpans;

        // No automatic parent-child relationship
        expect(inner?.parentSpanId).toBeUndefined();
        expect(outer?.parentSpanId).toBeUndefined();

        // Different trace IDs
        expect(inner?.traceId).not.toBe(outer?.traceId);
      });

      it("should handle unwaited async as independent spans", async () => {
        const { client, capturedSpans, waitForSignals } = helpers;

        client.trace("sync-parent", () => {
          // Start unwaited async
          client.trace("unwaited-async", async () => {
            await delay(50);
          });
        });

        await waitForSignals(2);

        expect(capturedSpans).toHaveLength(2);
        const [unwaitedAsync, syncParent] = capturedSpans;

        // Both are independent root spans
        expect(syncParent?.parentSpanId).toBeUndefined();
        expect(unwaitedAsync?.parentSpanId).toBeUndefined();

        // Different trace IDs
        expect(syncParent?.traceId).not.toBe(unwaitedAsync?.traceId);
      });

      it("should build complex hierarchies with explicit parents", () => {
        const { client, capturedSpans } = helpers;

        client.trace("root", (rootHandle) => {
          client.trace(
            "branch1",
            (branch1Handle) => {
              client.trace("leaf1", () => {}, { parent: branch1Handle });
              client.trace("leaf2", () => {}, { parent: branch1Handle });
            },
            { parent: rootHandle },
          );

          client.trace(
            "branch2",
            (branch2Handle) => {
              client.trace("leaf3", () => {}, { parent: branch2Handle });
            },
            { parent: rootHandle },
          );
        });

        expect(capturedSpans).toHaveLength(6);

        const root = capturedSpans.find((s) => s.name === "root");
        const branch1 = capturedSpans.find((s) => s.name === "branch1");
        const branch2 = capturedSpans.find((s) => s.name === "branch2");
        const leaf1 = capturedSpans.find((s) => s.name === "leaf1");
        const leaf2 = capturedSpans.find((s) => s.name === "leaf2");
        const leaf3 = capturedSpans.find((s) => s.name === "leaf3");

        // Verify explicit hierarchy
        expect(branch1?.parentSpanId).toBe(root?.id);
        expect(branch2?.parentSpanId).toBe(root?.id);
        expect(leaf1?.parentSpanId).toBe(branch1?.id);
        expect(leaf2?.parentSpanId).toBe(branch1?.id);
        expect(leaf3?.parentSpanId).toBe(branch2?.id);

        // All share the same trace ID
        const traceId = root?.traceId;
        [branch1, branch2, leaf1, leaf2, leaf3].forEach((span) => {
          expect(span?.traceId).toBe(traceId);
        });
      });

      it("should always return undefined for getCurrentSpan", () => {
        const { client } = helpers;

        // Outside any span
        expect(client.getCurrentSpan()).toBeUndefined();

        // Inside a span
        client.trace("test", () => {
          expect(client.getCurrentSpan()).toBeUndefined();

          // Even nested
          client.trace("nested", () => {
            expect(client.getCurrentSpan()).toBeUndefined();
          });
        });
      });

      it("should handle setTimeout without context concerns", async () => {
        const { client, capturedSpans } = helpers;

        await new Promise<void>((resolve) => {
          client.trace("before-timeout", () => {
            setTimeout(() => {
              // No context to lose in browser
              client.trace("in-timeout", () => {
                resolve();
              });
            }, 10);
          });
        });

        expect(capturedSpans).toHaveLength(2);
        const [inTimeout, beforeTimeout] = capturedSpans;

        // Both are independent
        expect(beforeTimeout?.parentSpanId).toBeUndefined();
        expect(inTimeout?.parentSpanId).toBeUndefined();
        expect(beforeTimeout?.traceId).not.toBe(inTimeout?.traceId);
      });

      it("should handle Promise chains as independent spans", async () => {
        const { client, capturedSpans } = helpers;

        await Promise.resolve()
          .then(() => client.trace("then1", () => delay(10)))
          .then(() => client.trace("then2", () => delay(10)))
          .then(() => client.trace("then3", () => {}));

        expect(capturedSpans).toHaveLength(3);

        // All are independent root spans
        capturedSpans.forEach((span) => {
          expect(span.parentSpanId).toBeUndefined();
        });

        // All have different trace IDs
        const traceIds = capturedSpans.map((s) => s.traceId);
        expect(new Set(traceIds).size).toBe(3);
      });

      it("should include browser specific resource data", () => {
        const { client, capturedSpans } = helpers;

        client.trace("test", () => {});

        const span = capturedSpans[0];
        expect(span?.resource).toBeDefined();
        expect(span?.resource.platform).toBe("browser");
        if (span?.resource.platform === "browser") {
          expect(span?.resource.browserName).toBeDefined();
          expect(span?.resource.browserVersion).toBeDefined();
          expect(span?.resource.browserUserAgent).toBeDefined();
          expect(span?.resource.osName).toBeDefined();
        }
      });

      it("should treat all spans independently without explicit parent", async () => {
        const { client, capturedSpans } = helpers;

        await client.trace("async-root", async () => {
          client.trace("sync-child", () => {
            client.trace("sync-grandchild", () => {});
          });

          await client.trace("async-child", async () => {
            await delay(10);
          });
        });

        expect(capturedSpans).toHaveLength(4);

        // All are independent without explicit parent
        capturedSpans.forEach((span) => {
          expect(span.parentSpanId).toBeUndefined();
        });

        // All have different trace IDs
        const traceIds = capturedSpans.map((s) => s.traceId);
        expect(new Set(traceIds).size).toBe(4);
      });

      it("should maintain explicit hierarchy through async operations", async () => {
        const { client, capturedSpans } = helpers;

        await client.trace("async-root", async (rootHandle) => {
          await delay(10);

          // Sync with explicit parent
          client.trace(
            "sync-child",
            (syncHandle) => {
              client.trace("sync-grandchild", () => {}, { parent: syncHandle });
            },
            { parent: rootHandle },
          );

          // Async with explicit parent
          await client.trace(
            "async-child",
            async () => {
              await delay(10);
            },
            { parent: rootHandle },
          );
        });

        expect(capturedSpans).toHaveLength(4);

        const root = capturedSpans.find((s) => s.name === "async-root");
        const syncChild = capturedSpans.find((s) => s.name === "sync-child");
        const syncGrandchild = capturedSpans.find((s) => s.name === "sync-grandchild");
        const asyncChild = capturedSpans.find((s) => s.name === "async-child");

        // Verify explicit relationships
        expect(syncChild?.parentSpanId).toBe(root?.id);
        expect(syncGrandchild?.parentSpanId).toBe(syncChild?.id);
        expect(asyncChild?.parentSpanId).toBe(root?.id);

        // All share the same trace ID
        const traceId = root?.traceId;
        [syncChild, syncGrandchild, asyncChild].forEach((span) => {
          expect(span?.traceId).toBe(traceId);
        });
      });
    });
  });
}
