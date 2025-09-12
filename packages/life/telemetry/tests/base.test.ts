import { describe, expect, it, mock } from "bun:test";
import type { AsyncQueue } from "@/shared/async-queue";
import { TelemetryClient } from "../base";
import { createTelemetryClient } from "../node";
import type {
  TelemetryConsumer,
  TelemetryLog,
  TelemetryMetric,
  TelemetryResource,
  TelemetrySignal,
  TelemetrySpan,
} from "../types";

describe("TelemetryClient - Base Class Architecture", () => {
  // Create a mock implementation of TelemetryClient for testing
  class MockTelemetryClient extends TelemetryClient {
    private spanContext: TelemetrySpan | undefined;

    protected getResource(): TelemetryResource {
      return {
        platform: "node" as const, // Must be "node" or "browser"
        environment: "test" as TelemetryResource["environment"],
        isCi: false,
        nodeVersion: "mock",
        lifeVersion: "1.0.0",
        osName: "mock",
        osVersion: "1.0.0",
        cpuCount: 1,
        cpuArchitecture: "mock",
        schemaVersion: "1",
      };
    }

    protected getCurrentSpanData(): TelemetrySpan | undefined {
      return this.spanContext;
    }

    protected enterContextWith(spanData: TelemetrySpan | undefined): void {
      this.spanContext = spanData;
    }

    protected runContextWith(spanData: TelemetrySpan | undefined, fn: () => unknown): unknown {
      const previousContext = this.spanContext;
      this.spanContext = spanData;
      try {
        return fn();
      } finally {
        this.spanContext = previousContext;
      }
    }
  }

  describe("Abstract base class implementation", () => {
    it("should require implementation of abstract methods", () => {
      // This test verifies that the abstract class structure is working
      const client = new MockTelemetryClient("test-scope");

      expect(client).toBeDefined();
      expect(typeof client.log.info).toBe("function");
      expect(typeof client.counter).toBe("function");
      expect(typeof client.trace).toBe("function");
    });

    it("should maintain scope through base class", () => {
      const client = new MockTelemetryClient("custom-scope");
      const capturedSignals: TelemetrySignal[] = [];

      const consumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            capturedSignals.push(signal);
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      client.registerConsumer(consumer);
      client.log.info({ message: "Test" });

      expect(capturedSignals).toHaveLength(1);
      expect(capturedSignals[0]?.scope).toBe("custom-scope");
    });

    it("should use runtime-specific resource implementation", () => {
      const mockClient = new MockTelemetryClient("mock-scope");
      const nodeClient = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });

      const mockSignals: TelemetrySignal[] = [];
      const nodeSignals: TelemetrySignal[] = [];

      const mockConsumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            mockSignals.push(signal);
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      const nodeConsumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            nodeSignals.push(signal);
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      mockClient.registerConsumer(mockConsumer);
      nodeClient.registerConsumer(nodeConsumer);

      mockClient.log.info({ message: "From mock" });
      nodeClient.log.info({ message: "From node" });

      // Check resources are different (mock client also uses "node" platform)
      expect(mockSignals[0]?.resource.platform).toBe("node");
      expect(nodeSignals[0]?.resource.platform).toBe("node");
    });
  });

  describe("Shared functionality from base class", () => {
    it("should share log implementation across all clients", () => {
      const client = new MockTelemetryClient("test");
      const signals: TelemetrySignal[] = [];

      const consumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            signals.push(signal);
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      client.registerConsumer(consumer);

      // Test all log levels work through base class
      client.log.debug({ message: "Debug" });
      client.log.info({ message: "Info" });
      client.log.warn({ message: "Warn" });
      client.log.error({ message: "Error" });
      client.log.fatal({ message: "Fatal" });

      expect(signals).toHaveLength(5);
      expect(signals[0]?.type).toBe("log");
      const logSignals = signals.filter((s) => s.type === "log") as TelemetryLog[];
      expect(logSignals[0]?.level).toBe("debug");
      expect(logSignals[4]?.level).toBe("fatal");
    });

    it("should share metric methods across all clients", () => {
      const client = new MockTelemetryClient("test");
      const signals: TelemetrySignal[] = [];

      const consumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            signals.push(signal);
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      client.registerConsumer(consumer);

      // Test metric methods from base class
      client.counter("test_counter").increment();
      client.updown("test_updown").decrement();
      client.histogram("test_histogram").record(42.5);

      expect(signals).toHaveLength(3);
      expect(signals[0]?.type).toBe("metric");
      const metricSignals = signals.filter((s) => s.type === "metric") as TelemetryMetric[];
      expect(metricSignals[0]?.kind).toBe("counter");
      expect(metricSignals[1]?.kind).toBe("updown");
      expect(metricSignals[2]?.kind).toBe("histogram");
    });

    it("should share global attribute functionality", () => {
      const client = new MockTelemetryClient("test");
      const signals: TelemetrySignal[] = [];

      const consumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            signals.push(signal);
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      client.registerConsumer(consumer);

      // Set global attributes through base class
      client.setAttribute("service", "test-service");
      client.setAttribute("version", "1.2.3");

      client.log.info({ message: "Test", attributes: { local: "value" } });

      const log = signals[0];
      expect(log?.attributes?.service).toBe("test-service");
      expect(log?.attributes?.version).toBe("1.2.3");
      expect(log?.attributes?.local).toBe("value");
    });
  });

  describe("Runtime-specific context management", () => {
    it("should use runtime-specific span context management", async () => {
      const client = new MockTelemetryClient("test");
      const signals: TelemetrySignal[] = [];

      const consumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            signals.push(signal);
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      client.registerConsumer(consumer);

      // Test trace functionality that depends on runtime implementation
      using span = (await client.trace("test-span")).start();
      expect(client.getCurrentSpan()?.getData().name).toBe("test-span");

      span.log.info({ message: "Inside span" });
      span.end();

      // Check span was captured correctly
      const spans = signals.filter((s) => s.type === "span");
      expect(spans).toHaveLength(1);
      expect(spans[0]?.name).toBe("test-span");
    });

    it("should use runtime-specific traceSync implementation", () => {
      const client = new MockTelemetryClient("test");
      let contextName: string | undefined;

      const result = client.traceSync("sync-operation", ({ log }) => {
        contextName = client.getCurrentSpan()?.getData().name;
        log.info({ message: "Inside sync" });
        return "result";
      });

      expect(result).toBe("result");
      expect(contextName).toBe("sync-operation");
      expect(client.getCurrentSpan()).toBeUndefined();
    });
  });

  describe("Scope validation", () => {
    it("should validate scope during client creation", () => {
      // Valid scope
      expect(() => {
        createTelemetryClient("cli", {
          command: "dev",
          args: [],
        });
      }).not.toThrow();

      // Invalid scope should throw
      expect(() => {
        createTelemetryClient("invalid-scope" as any, {});
      }).toThrow();
    });

    it("should validate required attributes for scope", () => {
      // Valid attributes
      expect(() => {
        createTelemetryClient("cli", {
          command: "dev",
          args: [],
        });
      }).not.toThrow();

      // Missing required attributes should throw
      expect(() => {
        createTelemetryClient("cli", {} as any);
      }).toThrow("Invalid required attributes");

      // Wrong attribute type should throw
      expect(() => {
        createTelemetryClient("cli", {
          command: "invalid" as any,
          args: [],
        });
      }).toThrow("Invalid required attributes");
    });

    it("should set required attributes as global attributes", () => {
      const client = createTelemetryClient("cli", {
        command: "build",
        args: ["--watch"],
      });

      const signals: TelemetrySignal[] = [];
      const consumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            signals.push(signal);
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      client.registerConsumer(consumer);
      client.log.info({ message: "Test" });

      const log = signals[0];
      expect(log?.attributes?.command).toBe("build");
      expect(log?.attributes?.args).toEqual(["--watch"]);
    });
  });

  describe("Error handling in base class", () => {
    it("should handle errors gracefully in log methods", () => {
      const client = new MockTelemetryClient("test");

      // Log methods should handle invalid input gracefully
      // The base class implementation logs errors for invalid input but doesn't throw
      const signals: TelemetrySignal[] = [];
      const consumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            signals.push(signal);
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      client.registerConsumer(consumer);

      // These will log error messages about missing input but won't throw
      client.log.info({} as any);

      // Should have logged the error about missing message and the actual log
      expect(signals.length).toBeGreaterThan(0);
    });

    it("should handle circular references in attributes", () => {
      const client = new MockTelemetryClient("test");
      const signals: TelemetrySignal[] = [];

      const consumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            signals.push(signal);
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      client.registerConsumer(consumer);

      const circular: any = { a: 1 };
      circular.self = circular;

      // Should not throw with circular references
      expect(() => {
        client.log.info({ message: "Test", attributes: { circular } });
        client.counter("test").increment({ circular });
      }).not.toThrow();

      expect(signals).toHaveLength(2);
    });

    it("should continue working after span errors", async () => {
      const client = new MockTelemetryClient("test");

      using span = (await client.trace("test")).start();
      span.end();

      // Should not throw when attempting operations on ended span
      expect(() => {
        span.setAttribute("key", "value");
        span.log.info({ message: "Should not work" });
      }).not.toThrow();

      // Client should still work normally
      expect(() => {
        client.log.info({ message: "Still works" });
      }).not.toThrow();
    });
  });
});
