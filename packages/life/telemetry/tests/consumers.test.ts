import { describe, expect, it } from "bun:test";
import type { AsyncQueue } from "@/shared/async-queue";
import { createTelemetryClient, TelemetryNodeClient } from "../node";
import type { TelemetryConsumer, TelemetrySignal } from "../types";

describe("TelemetryClient - Consumers", () => {
  describe("Local consumers", () => {
    it("should register and receive signals from a specific client", async () => {
      const client = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });

      const receivedSignals: TelemetrySignal[] = [];

      const consumer: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          // Start consuming in background
          (async () => {
            for await (const signal of queue) {
              receivedSignals.push(signal);
            }
          })();
        },
      };

      const unregister = client.registerConsumer(consumer);

      // Send some signals
      client.log.info({ message: "Test log" });
      client.counter("test_counter").increment();

      // Wait for queue to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedSignals).toHaveLength(2);
      expect(receivedSignals[0]?.type).toBe("log");
      expect(receivedSignals[1]?.type).toBe("metric");

      unregister();
    });

    it("should stop receiving signals after unregistration", async () => {
      const client = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });

      const receivedSignals: TelemetrySignal[] = [];
      const consumer: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          (async () => {
            for await (const signal of queue) {
              receivedSignals.push(signal);
            }
          })();
        },
      };

      const unregister = client.registerConsumer(consumer);

      client.log.info({ message: "Before unregister" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedSignals).toHaveLength(1);

      unregister();

      client.log.info({ message: "After unregister" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Should still be 1, not receiving new signals
      expect(receivedSignals).toHaveLength(1);
    });

    it("should support multiple local consumers", async () => {
      const client = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });

      const signals1: TelemetrySignal[] = [];
      const signals2: TelemetrySignal[] = [];

      const consumer1: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          (async () => {
            for await (const signal of queue) {
              signals1.push(signal);
            }
          })();
        },
      };

      const consumer2: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          (async () => {
            for await (const signal of queue) {
              signals2.push(signal);
            }
          })();
        },
      };

      client.registerConsumer(consumer1);
      client.registerConsumer(consumer2);

      client.log.info({ message: "Test" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Both should receive the signal
      expect(signals1).toHaveLength(1);
      expect(signals2).toHaveLength(1);
    });
  });

  describe("Global consumers", () => {
    it("should receive signals from all clients", async () => {
      const receivedSignals: TelemetrySignal[] = [];
      const globalConsumer: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          (async () => {
            for await (const signal of queue) {
              receivedSignals.push(signal);
            }
          })();
        },
      };

      const unregister = TelemetryNodeClient.registerGlobalConsumer(globalConsumer);

      // Create multiple clients
      const client1 = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });

      const client2 = createTelemetryClient("server", {
        watch: true,
      });

      // Send signals from both
      client1.log.info({ message: "From CLI" });
      client2.log.info({ message: "From Server" });

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(receivedSignals).toHaveLength(2);
      expect(receivedSignals.find((s) => s.scope === "cli")).toBeDefined();
      expect(receivedSignals.find((s) => s.scope === "server")).toBeDefined();

      unregister();
    });

    it("should allow both global and local consumers simultaneously", async () => {
      const globalSignals: TelemetrySignal[] = [];
      const localSignals: TelemetrySignal[] = [];

      const globalConsumer: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          (async () => {
            for await (const signal of queue) {
              globalSignals.push(signal);
            }
          })();
        },
      };

      const localConsumer: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          (async () => {
            for await (const signal of queue) {
              localSignals.push(signal);
            }
          })();
        },
      };

      const unregisterGlobal = TelemetryNodeClient.registerGlobalConsumer(globalConsumer);

      const client = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });

      const unregisterLocal = client.registerConsumer(localConsumer);

      client.log.info({ message: "Test message" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Both should receive the signal
      expect(globalSignals).toHaveLength(1);
      expect(localSignals).toHaveLength(1);

      unregisterGlobal();
      unregisterLocal();
    });

    it("should handle multiple global consumers", async () => {
      const signals1: TelemetrySignal[] = [];
      const signals2: TelemetrySignal[] = [];

      const consumer1: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          (async () => {
            for await (const signal of queue) {
              signals1.push(signal);
            }
          })();
        },
      };

      const consumer2: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          (async () => {
            for await (const signal of queue) {
              signals2.push(signal);
            }
          })();
        },
      };

      const unregister1 = TelemetryNodeClient.registerGlobalConsumer(consumer1);
      const unregister2 = TelemetryNodeClient.registerGlobalConsumer(consumer2);

      const client = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });

      client.log.info({ message: "Test" });
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Both global consumers should receive the signal
      expect(signals1).toHaveLength(1);
      expect(signals2).toHaveLength(1);

      unregister1();
      unregister2();
    });
  });

  describe("Consumer with isProcessing", () => {
    it("should use isProcessing for flush operation", async () => {
      const client = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });

      let processing = false;
      const processedSignals: TelemetrySignal[] = [];

      const consumer: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          (async () => {
            for await (const signal of queue) {
              processing = true;
              // Simulate slow processing
              await new Promise((resolve) => setTimeout(resolve, 20));
              processedSignals.push(signal);
              processing = false;
            }
          })();
        },
        isProcessing: () => processing,
      };

      client.registerConsumer(consumer);

      // Send signals
      client.log.info({ message: "Message 1" });
      client.log.info({ message: "Message 2" });

      // Immediately check - should not be processed yet
      expect(processedSignals).toHaveLength(0);

      // Flush should wait for processing
      await client.flushConsumers(1000);

      // After flush, all should be processed
      expect(processedSignals).toHaveLength(2);
    });
  });

  describe("Queue behavior", () => {
    it("should check queue length", () => {
      const client = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });

      let queueRef: AsyncQueue<TelemetrySignal> | undefined;

      const consumer: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          queueRef = queue;
          // Don't consume yet
        },
      };

      client.registerConsumer(consumer);

      // Send multiple signals
      for (let i = 0; i < 5; i++) {
        client.log.info({ message: `Message ${i}` });
      }

      // Check queue has items
      expect(queueRef?.length()).toBe(5);
    });

    it("should handle queue after unregistration", async () => {
      const client = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });

      let queueRef: AsyncQueue<TelemetrySignal> | undefined;
      let consumerStopped = false;

      const consumer: TelemetryConsumer = {
        start: (queue: AsyncQueue<TelemetrySignal>) => {
          queueRef = queue;
          (async () => {
            for await (const _signal of queue) {
              // Just consume
            }
            consumerStopped = true;
          })();
        },
      };

      const unregister = client.registerConsumer(consumer);

      client.log.info({ message: "Test" });
      expect(queueRef?.length()).toBe(1);

      // Unregister should stop the queue
      unregister();

      // Give time for the consumer to finish
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Consumer should have stopped
      expect(consumerStopped).toBe(true);
    });
  });
});
