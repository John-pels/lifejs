// biome-ignore-all lint: test file
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AsyncQueue } from "@/shared/async-queue";
import type { TelemetryClient } from "../../clients/base";
import type { TelemetryConsumer, TelemetrySignal } from "../../types";
import type { TestContext } from "./utils";
import { delay } from "./utils";

export function createConsumerTests(context: TestContext) {
  describe("TelemetryClient - Consumers", () => {
    let client: TelemetryClient;
    let unregisterFns: Array<() => void> = [];

    beforeEach(() => {
      client = context.createClient();
      unregisterFns = [];
    });

    afterEach(() => {
      unregisterFns.forEach((fn) => fn());
    });

    describe("Consumer Registration", () => {
      it("should register a consumer and receive signals", () => {
        const signals: TelemetrySignal[] = [];
        const consumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn((signal: TelemetrySignal) => {
              signals.push(signal);
              return originalPush(signal);
            });
          }),
          isProcessing: vi.fn(() => false),
        };

        const unregister = client.registerConsumer(consumer);
        unregisterFns.push(unregister);

        client.log.info({ message: "Test log" });
        client.counter("test").increment();
        client.trace("test-span", () => {});

        expect(signals).toHaveLength(3);
        expect(signals[0]?.type).toBe("log");
        expect(signals[1]?.type).toBe("metric");
        expect(signals[2]?.type).toBe("span");
      });

      it("should support multiple consumers", () => {
        const signals1: TelemetrySignal[] = [];
        const signals2: TelemetrySignal[] = [];

        const consumer1: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn((signal: TelemetrySignal) => {
              signals1.push(signal);
              return originalPush(signal);
            });
          }),
          isProcessing: vi.fn(() => false),
        };

        const consumer2: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn((signal: TelemetrySignal) => {
              signals2.push(signal);
              return originalPush(signal);
            });
          }),
          isProcessing: vi.fn(() => false),
        };

        unregisterFns.push(client.registerConsumer(consumer1));
        unregisterFns.push(client.registerConsumer(consumer2));

        client.log.info({ message: "Test" });

        expect(signals1).toHaveLength(1);
        expect(signals2).toHaveLength(1);
        expect(signals1[0]).toEqual(signals2[0]);
      });

      it("should unregister consumer", () => {
        const signals: TelemetrySignal[] = [];
        const consumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn((signal: TelemetrySignal) => {
              signals.push(signal);
              return originalPush(signal);
            });
          }),
          isProcessing: vi.fn(() => false),
        };

        const unregister = client.registerConsumer(consumer);

        client.log.info({ message: "Before unregister" });
        expect(signals).toHaveLength(1);

        unregister();

        client.log.info({ message: "After unregister" });
        expect(signals).toHaveLength(1); // Should not receive new signals
      });

      it("should handle unregister called multiple times", () => {
        const consumer: TelemetryConsumer = {
          start: vi.fn(),
          isProcessing: vi.fn(() => false),
        };

        const unregister = client.registerConsumer(consumer);

        expect(() => {
          unregister();
          unregister(); // Second call should not throw
          unregister(); // Third call should not throw
        }).not.toThrow();
      });
    });

    describe("Signal Delivery", () => {
      it("should deliver all signal types", () => {
        const signals: TelemetrySignal[] = [];
        const consumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn((signal: TelemetrySignal) => {
              signals.push(signal);
              return originalPush(signal);
            });
          }),
          isProcessing: vi.fn(() => false),
        };

        unregisterFns.push(client.registerConsumer(consumer));

        // Generate different signal types
        client.log.debug({ message: "Debug" });
        client.log.info({ message: "Info" });
        client.log.warn({ message: "Warn" });
        client.log.error({ message: "Error" });
        client.log.fatal({ message: "Fatal" });

        client.counter("counter").increment();
        client.updown("updown").add(5);
        client.histogram("histogram").record(100);

        client.trace("span", () => {});

        expect(signals).toHaveLength(9);

        // Check signal types
        const types = signals.map((s) => s.type);
        expect(types.filter((t) => t === "log")).toHaveLength(5);
        expect(types.filter((t) => t === "metric")).toHaveLength(3);
        expect(types.filter((t) => t === "span")).toHaveLength(1);
      });

      it("should preserve signal order", () => {
        const signals: TelemetrySignal[] = [];
        const consumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn((signal: TelemetrySignal) => {
              signals.push(signal);
              return originalPush(signal);
            });
          }),
          isProcessing: vi.fn(() => false),
        };

        unregisterFns.push(client.registerConsumer(consumer));

        client.log.info({ message: "First" });
        client.counter("test").increment();
        client.log.warn({ message: "Second" });
        client.trace("span", () => {});
        client.log.error({ message: "Third" });

        expect(signals).toHaveLength(5);
        expect((signals[0] as any).message).toBe("First");
        expect(signals[1]?.type).toBe("metric");
        expect((signals[2] as any).message).toBe("Second");
        expect(signals[3]?.type).toBe("span");
        expect((signals[4] as any).message).toBe("Third");
      });
    });

    describe("Consumer Flushing", () => {
      it("should flush consumers", async () => {
        let isProcessing = false;
        const processedSignals: TelemetrySignal[] = [];

        const consumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            // Simulate async processing
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn(async (signal: TelemetrySignal) => {
              const result = originalPush(signal);
              isProcessing = true;
              await delay(10); // Simulate processing time
              processedSignals.push(signal);
              isProcessing = false;
              return result;
            });
          }),
          isProcessing: vi.fn(() => isProcessing),
        };

        unregisterFns.push(client.registerConsumer(consumer));

        client.log.info({ message: "Test1" });
        client.log.info({ message: "Test2" });
        client.log.info({ message: "Test3" });

        // Flush should wait for all signals to be processed
        await client.flushConsumers(1000);

        expect(processedSignals).toHaveLength(3);
      });

      it("should timeout if flush takes too long", async () => {
        const isProcessing = true;

        const consumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn(async (signal: TelemetrySignal) => {
              const result = originalPush(signal);
              // Never complete processing
              await new Promise(() => {});
              return result;
            });
          }),
          isProcessing: vi.fn(() => isProcessing),
        };

        unregisterFns.push(client.registerConsumer(consumer));

        client.log.info({ message: "Test" });

        const startTime = Date.now();
        await client.flushConsumers(100); // Short timeout
        const duration = Date.now() - startTime;

        // Should timeout around 100ms, not hang forever
        expect(duration).toBeGreaterThanOrEqual(95);
        expect(duration).toBeLessThan(200);
      });

      it("should handle flush with no consumers", async () => {
        // No consumers registered
        client.log.info({ message: "Test" });

        // Should complete without error
        await expect(client.flushConsumers(100)).resolves.toBeUndefined();
      });
    });

    describe("Consumer Errors", () => {
      it("should handle consumer start errors gracefully", () => {
        const consumer: TelemetryConsumer = {
          start: vi.fn(() => {
            throw new Error("Consumer start failed");
          }),
          isProcessing: vi.fn(() => false),
        };

        // Should not throw
        expect(() => {
          const unregister = client.registerConsumer(consumer);
          unregisterFns.push(unregister);
        }).not.toThrow();

        // Client should continue working
        expect(() => {
          client.log.info({ message: "Test" });
        }).not.toThrow();
      });

      it("should handle consumer processing errors", () => {
        const signals: TelemetrySignal[] = [];
        let errorCount = 0;
        const consumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn((signal: TelemetrySignal) => {
              try {
                if (signal.type === "metric") {
                  errorCount++;
                  throw new Error("Metric processing failed");
                }
                signals.push(signal);
              } catch (error) {
                // Consumer error is caught
              }
              return originalPush(signal);
            });
          }),
          isProcessing: vi.fn(() => false),
        };

        unregisterFns.push(client.registerConsumer(consumer));

        // Should not throw even if consumer fails
        expect(() => {
          client.log.info({ message: "Log1" });
          client.counter("test").increment(); // This will fail in consumer
          client.log.info({ message: "Log2" });
        }).not.toThrow();

        // Verify error was encountered but other signals processed
        expect(errorCount).toBe(1);
        expect(signals.filter((s) => s.type === "log")).toHaveLength(2);
      });

      it("should isolate errors between consumers", () => {
        const signals2: TelemetrySignal[] = [];

        const failingConsumer: TelemetryConsumer = {
          start: vi.fn(() => {
            throw new Error("Consumer failed");
          }),
          isProcessing: vi.fn(() => false),
        };

        const workingConsumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn((signal: TelemetrySignal) => {
              signals2.push(signal);
              return originalPush(signal);
            });
          }),
          isProcessing: vi.fn(() => false),
        };

        unregisterFns.push(client.registerConsumer(failingConsumer));
        unregisterFns.push(client.registerConsumer(workingConsumer));

        client.log.info({ message: "Test" });

        // Working consumer should still receive signals
        expect(signals2).toHaveLength(1);
      });
    });

    describe("Global Consumers", () => {
      it("should support global consumers across all clients", () => {
        const signals: TelemetrySignal[] = [];
        const globalConsumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn((signal: TelemetrySignal) => {
              signals.push(signal);
              return originalPush(signal);
            });
          }),
          isProcessing: vi.fn(() => false),
        };

        // Register global consumer using static method
        const TelemetryClient = Object.getPrototypeOf(Object.getPrototypeOf(client)).constructor;
        const unregisterGlobal = TelemetryClient.registerGlobalConsumer(globalConsumer);
        unregisterFns.push(unregisterGlobal);

        // Create multiple clients
        const client1 = context.createClient();
        const client2 = context.createClient();

        client1.log.info({ message: "From client1" });
        client2.log.info({ message: "From client2" });

        // Global consumer should receive signals from both clients
        expect(signals).toHaveLength(2);
        expect((signals[0] as any).message).toBe("From client1");
        expect((signals[1] as any).message).toBe("From client2");
      });

      it("should flush all global consumers", async () => {
        let isProcessing = false;
        const processedSignals: TelemetrySignal[] = [];

        const globalConsumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn(async (signal: TelemetrySignal) => {
              const result = originalPush(signal);
              isProcessing = true;
              await delay(10);
              processedSignals.push(signal);
              isProcessing = false;
              return result;
            });
          }),
          isProcessing: vi.fn(() => isProcessing),
        };

        const TelemetryClient = Object.getPrototypeOf(Object.getPrototypeOf(client)).constructor;
        const unregisterGlobal = TelemetryClient.registerGlobalConsumer(globalConsumer);
        unregisterFns.push(unregisterGlobal);

        const client1 = context.createClient();
        const client2 = context.createClient();

        client1.log.info({ message: "Test1" });
        client2.log.info({ message: "Test2" });

        // Flush all clients
        await TelemetryClient.flushAllConsumers(1000);

        expect(processedSignals).toHaveLength(2);
      });
    });

    describe("Client Attributes in Consumers", () => {
      it("should include client attributes in all signals", () => {
        const signals: TelemetrySignal[] = [];
        const consumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn((signal: TelemetrySignal) => {
              signals.push(signal);
              return originalPush(signal);
            });
          }),
          isProcessing: vi.fn(() => false),
        };

        unregisterFns.push(client.registerConsumer(consumer));

        client.setAttribute("service", "test-service");
        client.setAttributes({ version: "1.0.0", environment: "test" });

        client.log.info({ message: "Test" });
        client.counter("test").increment();
        client.trace("test", () => {});

        expect(signals).toHaveLength(3);
        signals.forEach((signal) => {
          expect(signal.attributes).toMatchObject({
            service: "test-service",
            version: "1.0.0",
            environment: "test",
          });
        });
      });

      it("should merge signal attributes with client attributes", () => {
        const signals: TelemetrySignal[] = [];
        const consumer: TelemetryConsumer = {
          start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
            const originalPush = queue.push.bind(queue);
            queue.push = vi.fn((signal: TelemetrySignal) => {
              signals.push(signal);
              return originalPush(signal);
            });
          }),
          isProcessing: vi.fn(() => false),
        };

        unregisterFns.push(client.registerConsumer(consumer));

        client.setAttribute("global", "value");

        client.log.info({
          message: "Test",
          attributes: { local: "attribute" },
        });

        expect(signals[0]?.attributes).toMatchObject({
          global: "value",
          local: "attribute",
        });
      });
    });
  });
}
