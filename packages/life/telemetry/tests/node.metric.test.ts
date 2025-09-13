import { describe, expect, it, mock } from "bun:test";
import type { AsyncQueue } from "@/shared/async-queue";
import { createTelemetryClient } from "../node";
import type { TelemetryConsumer, TelemetryMetric, TelemetrySignal } from "../types";

describe("TelemetryClient - metric methods", () => {
  function createTestClient() {
    const client = createTelemetryClient("cli", {
      command: "dev",
      args: [],
    });

    const capturedMetrics: TelemetryMetric[] = [];

    const mockConsumer: TelemetryConsumer = {
      start: mock((queue: AsyncQueue<TelemetrySignal>) => {
        const originalPush = queue.push.bind(queue);
        queue.push = mock((signal: TelemetrySignal) => {
          if (signal.type === "metric") {
            capturedMetrics.push(signal as TelemetryMetric);
          }
          return originalPush(signal);
        });
      }),
      isProcessing: mock(() => false),
    };

    const unregister = client.registerConsumer(mockConsumer);

    return { client, capturedMetrics, unregister };
  }

  describe("counter() method", () => {
    it("should create and increment a counter", () => {
      const { client, capturedMetrics } = createTestClient();

      const requestCounter = client.counter("http_requests_total");
      requestCounter.increment();

      expect(capturedMetrics).toHaveLength(1);
      const metric = capturedMetrics[0];
      expect(metric?.name).toBe("http_requests_total");
      expect(metric?.kind).toBe("counter");
      if (metric?.kind === "counter") {
        expect(metric.value).toBe(1);
      }
    });

    it("should add custom values to counter", () => {
      const { client, capturedMetrics } = createTestClient();

      const bytesCounter = client.counter("bytes_processed");
      bytesCounter.add(1024);
      bytesCounter.add(2048);

      expect(capturedMetrics).toHaveLength(2);
      if (capturedMetrics[0]?.kind === "counter") {
        expect(capturedMetrics[0].value).toBe(1024);
      }
      if (capturedMetrics[1]?.kind === "counter") {
        expect(capturedMetrics[1].value).toBe(2048);
      }
    });

    it("should include attributes with counter", () => {
      const { client, capturedMetrics } = createTestClient();

      const counter = client.counter("api_calls");
      counter.increment({ method: "GET", endpoint: "/users" });
      counter.increment({ method: "POST", endpoint: "/users" });

      expect(capturedMetrics).toHaveLength(2);

      const metric1 = capturedMetrics[0];
      expect(metric1?.attributes?.method).toBeDefined();
      expect(metric1?.attributes?.endpoint).toBeDefined();
      if (metric1?.attributes?.method && metric1?.attributes?.endpoint) {
        expect(metric1.attributes.method).toBe("GET");
        expect(metric1.attributes.endpoint).toBe("/users");
      }

      const metric2 = capturedMetrics[1];
      if (metric2?.attributes?.method && metric2?.attributes?.endpoint) {
        expect(metric2.attributes.method).toBe("POST");
        expect(metric2.attributes.endpoint).toBe("/users");
      }
    });

    it("should handle negative values in counter", () => {
      const { client, capturedMetrics } = createTestClient();

      const counter = client.counter("test_counter");
      counter.add(-5); // Counters typically shouldn't go negative, but API allows it

      expect(capturedMetrics).toHaveLength(1);
      if (capturedMetrics[0]?.kind === "counter") {
        expect(capturedMetrics[0].value).toBe(-5);
      }
    });

    it("should include metric ID and timestamps", () => {
      const { client, capturedMetrics } = createTestClient();

      const counter = client.counter("test");
      counter.increment();

      const metric = capturedMetrics[0];
      expect(metric?.id).toBeDefined();
      // biome-ignore lint/performance/useTopLevelRegex: test-specific regex
      expect(metric?.id).toMatch(/^[0-9a-f]{32}$/);
    });

    it("should include resource and scope", () => {
      const { client, capturedMetrics } = createTestClient();

      const counter = client.counter("test");
      counter.increment();

      const metric = capturedMetrics[0];
      expect(metric?.resource.platform).toBe("node");
      expect(metric?.resource.environment).toBeDefined();
      expect(metric?.scope).toBe("cli");
    });

    it("should handle multiple counters independently", () => {
      const { client, capturedMetrics } = createTestClient();

      const counter1 = client.counter("counter1");
      const counter2 = client.counter("counter2");

      counter1.increment();
      counter2.add(5);
      counter1.add(3);

      expect(capturedMetrics).toHaveLength(3);
      expect(capturedMetrics[0]?.name).toBe("counter1");
      if (capturedMetrics[0]?.kind === "counter") {
        expect(capturedMetrics[0].value).toBe(1);
      }
      expect(capturedMetrics[1]?.name).toBe("counter2");
      if (capturedMetrics[1]?.kind === "counter") {
        expect(capturedMetrics[1].value).toBe(5);
      }
      expect(capturedMetrics[2]?.name).toBe("counter1");
      if (capturedMetrics[2]?.kind === "counter") {
        expect(capturedMetrics[2].value).toBe(3);
      }
    });
  });

  describe("updown() method", () => {
    it("should create and use an up/down counter", () => {
      const { client, capturedMetrics } = createTestClient();

      const gauge = client.updown("active_connections");
      gauge.increment();
      gauge.increment();
      gauge.decrement();

      expect(capturedMetrics).toHaveLength(3);
      for (const metric of capturedMetrics) {
        expect(metric?.kind).toBe("updown");
      }
      if (capturedMetrics[0]?.kind === "updown") {
        expect(capturedMetrics[0].value).toBe(1);
      }
      if (capturedMetrics[1]?.kind === "updown") {
        expect(capturedMetrics[1].value).toBe(1);
      }
      if (capturedMetrics[2]?.kind === "updown") {
        expect(capturedMetrics[2].value).toBe(-1);
      }
    });

    it("should add and remove custom values", () => {
      const { client, capturedMetrics } = createTestClient();

      const gauge = client.updown("memory_usage_bytes");
      gauge.add(1024 * 1024);
      gauge.remove(512 * 1024);

      expect(capturedMetrics).toHaveLength(2);
      if (capturedMetrics[0]?.kind === "updown") {
        expect(capturedMetrics[0].value).toBe(1024 * 1024);
      }
      if (capturedMetrics[1]?.kind === "updown") {
        expect(capturedMetrics[1].value).toBe(-512 * 1024);
      }
    });

    it("should include attributes with updown counter", () => {
      const { client, capturedMetrics } = createTestClient();

      const gauge = client.updown("queue_size");
      gauge.increment({ queue: "emails", priority: "high" });
      gauge.decrement({ queue: "emails", priority: "high" });

      expect(capturedMetrics).toHaveLength(2);
      const attrs = capturedMetrics[0]?.attributes;
      if (attrs?.queue && attrs?.priority) {
        expect(attrs.queue).toBe("emails");
        expect(attrs.priority).toBe("high");
      }
    });

    it("should handle zero values", () => {
      const { client, capturedMetrics } = createTestClient();

      const gauge = client.updown("test");
      gauge.add(0);
      gauge.remove(0);

      expect(capturedMetrics).toHaveLength(2);
      const metric1 = capturedMetrics[0];
      const metric2 = capturedMetrics[1];
      if (metric1?.kind === "updown" && metric2?.kind === "updown") {
        expect(metric1.value).toBe(0);
        expect(Object.is(metric2.value, -0)).toBe(true);
      }
    });
  });

  describe("histogram() method", () => {
    it("should record histogram values", () => {
      const { client, capturedMetrics } = createTestClient();

      const latency = client.histogram("request_duration_ms");
      latency.record(150);
      latency.record(200);
      latency.record(100);

      expect(capturedMetrics).toHaveLength(3);
      for (const metric of capturedMetrics) {
        expect(metric?.kind).toBe("histogram");
      }
      if (capturedMetrics[0]?.kind === "histogram") {
        expect(capturedMetrics[0].value).toBe(150);
      }
      if (capturedMetrics[1]?.kind === "histogram") {
        expect(capturedMetrics[1].value).toBe(200);
      }
      if (capturedMetrics[2]?.kind === "histogram") {
        expect(capturedMetrics[2].value).toBe(100);
      }
    });

    it("should include attributes with histogram", () => {
      const { client, capturedMetrics } = createTestClient();

      const histogram = client.histogram("db_query_duration");
      histogram.record(45.5, {
        operation: "SELECT",
        table: "users",
        success: true,
      });

      expect(capturedMetrics).toHaveLength(1);
      const attrs = capturedMetrics[0]?.attributes;
      if (attrs?.operation && attrs?.table && attrs?.success) {
        expect(attrs.operation).toBe("SELECT");
        expect(attrs.table).toBe("users");
        expect(attrs.success).toBe(true);
      }
    });

    it("should handle floating point values", () => {
      const { client, capturedMetrics } = createTestClient();

      const histogram = client.histogram("response_time");
      histogram.record(123.456);
      histogram.record(0.001);
      histogram.record(999_999.999);

      expect(capturedMetrics).toHaveLength(3);
      if (capturedMetrics[0]?.kind === "histogram") {
        expect(capturedMetrics[0].value).toBe(123.456);
      }
      if (capturedMetrics[1]?.kind === "histogram") {
        expect(capturedMetrics[1].value).toBe(0.001);
      }
      if (capturedMetrics[2]?.kind === "histogram") {
        expect(capturedMetrics[2].value).toBe(999_999.999);
      }
    });

    it("should handle negative values", () => {
      const { client, capturedMetrics } = createTestClient();

      const histogram = client.histogram("temperature_celsius");
      histogram.record(-10.5);
      histogram.record(25.0);
      histogram.record(-40.0);

      expect(capturedMetrics).toHaveLength(3);
      if (capturedMetrics[0]?.kind === "histogram") {
        expect(capturedMetrics[0].value).toBe(-10.5);
      }
      if (capturedMetrics[1]?.kind === "histogram") {
        expect(capturedMetrics[1].value).toBe(25.0);
      }
      if (capturedMetrics[2]?.kind === "histogram") {
        expect(capturedMetrics[2].value).toBe(-40.0);
      }
    });
  });

  describe("global attributes and inheritance", () => {
    it("should include global attributes in all metrics", () => {
      const { client, capturedMetrics } = createTestClient();

      client.setAttribute("service", "api");
      client.setAttribute("region", "us-west-2");

      const counter = client.counter("requests");
      counter.increment({ path: "/health" });

      const gauge = client.updown("connections");
      gauge.increment({ protocol: "http" });

      const histogram = client.histogram("latency");
      histogram.record(100, { status: "200" });

      expect(capturedMetrics).toHaveLength(3);

      // All metrics should have global attributes
      for (const metric of capturedMetrics) {
        expect(metric?.attributes?.service).toBeDefined();
        expect(metric?.attributes?.region).toBeDefined();
        if (metric?.attributes?.service && metric?.attributes?.region) {
          expect(metric.attributes.service).toBe("api");
          expect(metric.attributes.region).toBe("us-west-2");
        }
      }
    });

    it("should work with different scope telemetry clients", () => {
      const client1 = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });
      const client2 = createTelemetryClient("server", {
        watch: true,
      });

      const capturedMetrics: TelemetryMetric[] = [];
      const mockConsumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            if (signal.type === "metric") {
              capturedMetrics.push(signal as TelemetryMetric);
            }
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };

      client1.registerConsumer(mockConsumer);
      client2.registerConsumer(mockConsumer);

      const counter1 = client1.counter("tasks_processed");
      const counter2 = client2.counter("requests_handled");
      counter1.increment();
      counter2.increment();

      expect(capturedMetrics).toHaveLength(2);
      expect(capturedMetrics[0]?.scope).toBe("cli");
      expect(capturedMetrics[1]?.scope).toBe("server");
    });

    it("should handle global attributes independently per client", () => {
      const client1 = createTelemetryClient("cli", {
        command: "dev",
        args: [],
      });
      const client2 = createTelemetryClient("server", {
        watch: false,
      });

      const capturedMetrics: TelemetryMetric[] = [];
      const mockConsumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            if (signal.type === "metric") {
              capturedMetrics.push(signal as TelemetryMetric);
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

      const counter1 = client1.counter("test");
      const counter2 = client2.counter("test");
      counter1.increment();
      counter2.increment();

      const metric1 = capturedMetrics[0];
      const metric2 = capturedMetrics[1];

      expect(metric1?.attributes?.client1Attr).toBe("value1");
      expect(metric1?.attributes?.client2Attr).toBeUndefined();
      expect(metric2?.attributes?.client2Attr).toBe("value2");
      expect(metric2?.attributes?.client1Attr).toBeUndefined();
    });
  });

  describe("edge cases and error scenarios", () => {
    it("should handle very large metric values", () => {
      const { client, capturedMetrics } = createTestClient();

      const counter = client.counter("large_values");
      counter.add(Number.MAX_SAFE_INTEGER);

      const histogram = client.histogram("huge_values");
      histogram.record(Number.MAX_VALUE);
      histogram.record(Number.MIN_VALUE);

      expect(capturedMetrics).toHaveLength(3);
      if (capturedMetrics[0]?.kind === "counter" || capturedMetrics[0]?.kind === "updown") {
        expect(capturedMetrics[0].value).toBe(Number.MAX_SAFE_INTEGER);
      }
      if (capturedMetrics[1]?.kind === "histogram") {
        expect(capturedMetrics[1].value).toBe(Number.MAX_VALUE);
      }
      if (capturedMetrics[2]?.kind === "histogram") {
        expect(capturedMetrics[2].value).toBe(Number.MIN_VALUE);
      }
    });

    it("should handle Infinity and NaN values", () => {
      const { client, capturedMetrics } = createTestClient();

      const histogram = client.histogram("special_values");
      histogram.record(Number.POSITIVE_INFINITY);
      histogram.record(Number.NEGATIVE_INFINITY);
      histogram.record(Number.NaN);

      expect(capturedMetrics).toHaveLength(3);
      if (capturedMetrics[0]?.kind === "histogram") {
        expect(capturedMetrics[0].value).toBe(Number.POSITIVE_INFINITY);
      }
      if (capturedMetrics[1]?.kind === "histogram") {
        expect(capturedMetrics[1].value).toBe(Number.NEGATIVE_INFINITY);
      }
      if (capturedMetrics[2]?.kind === "histogram") {
        expect(capturedMetrics[2].value).toBe(Number.NaN);
      }
    });

    it("should handle null and undefined in attributes", () => {
      const { client, capturedMetrics } = createTestClient();

      const counter = client.counter("test");
      counter.increment({
        nullValue: null,
        undefinedValue: undefined,
        validValue: "test",
      });

      expect(capturedMetrics).toHaveLength(1);
      const attrs = capturedMetrics[0]?.attributes;
      expect(attrs?.validValue).toBeDefined();
    });

    it("should handle circular references in attributes", () => {
      const { client, capturedMetrics } = createTestClient();

      const circular: any = { a: 1 };
      circular.self = circular;

      const counter = client.counter("test");
      counter.increment({ circular });

      expect(capturedMetrics).toHaveLength(1);
    });

    it("should handle multiple consumers", () => {
      const { client, capturedMetrics } = createTestClient();
      const secondCapturedMetrics: TelemetryMetric[] = [];

      // Register a second consumer
      const secondConsumer: TelemetryConsumer = {
        start: mock((queue: AsyncQueue<TelemetrySignal>) => {
          const originalPush = queue.push.bind(queue);
          queue.push = mock((signal: TelemetrySignal) => {
            if (signal.type === "metric") {
              secondCapturedMetrics.push(signal as TelemetryMetric);
            }
            return originalPush(signal);
          });
        }),
        isProcessing: mock(() => false),
      };
      const unregister2 = client.registerConsumer(secondConsumer);

      const counter = client.counter("test");
      counter.increment();

      expect(capturedMetrics).toHaveLength(1);
      expect(secondCapturedMetrics).toHaveLength(1);
      expect(capturedMetrics[0]?.name).toBe("test");
      expect(secondCapturedMetrics[0]?.name).toBe("test");

      unregister2();
    });

    it("should handle metrics after consumer unregistration", () => {
      const { client, capturedMetrics, unregister } = createTestClient();

      const counter = client.counter("test");
      counter.increment();
      expect(capturedMetrics).toHaveLength(1);

      unregister();

      counter.increment();
      expect(capturedMetrics).toHaveLength(1);
    });

    it("should handle concurrent metric recording", async () => {
      const { client, capturedMetrics } = createTestClient();

      const counter = client.counter("concurrent");
      const promises = new Array(100)
        .fill(0)
        .map((_, i) => Promise.resolve().then(() => counter.increment({ index: i })));

      await Promise.all(promises);

      expect(capturedMetrics).toHaveLength(100);
      const indices = capturedMetrics
        .map((m) => (m.attributes?.index !== undefined ? Number(m.attributes.index) : null))
        .filter((i) => i !== null)
        .sort((a, b) => a - b);
      expect(indices[0]).toBe(0);
      expect(indices[99]).toBe(99);
    });

    it("should handle very long metric names", () => {
      const { client, capturedMetrics } = createTestClient();

      const longName = `metric_${"x".repeat(1000)}`;
      const counter = client.counter(longName);
      counter.increment();

      expect(capturedMetrics).toHaveLength(1);
      expect(capturedMetrics[0]?.name).toBe(longName);
    });

    it("should handle complex nested attributes", () => {
      const { client, capturedMetrics } = createTestClient();

      const counter = client.counter("complex");
      counter.increment({
        user: {
          id: "123",
          profile: {
            name: "John",
            preferences: {
              theme: "dark",
              notifications: true,
            },
          },
        },
        metadata: {
          timestamp: new Date("2024-01-01"),
          tags: ["important", "user-action"],
        },
      });

      expect(capturedMetrics).toHaveLength(1);
      const attrs = capturedMetrics[0]?.attributes;
      expect(attrs?.user).toBeDefined();
      expect(attrs?.metadata).toBeDefined();
    });

    it("should maintain metric isolation between different types", () => {
      const { client, capturedMetrics } = createTestClient();

      const counter = client.counter("metric_name");
      const updown = client.updown("metric_name");
      const histogram = client.histogram("metric_name");

      counter.increment();
      updown.decrement();
      histogram.record(42);

      expect(capturedMetrics).toHaveLength(3);
      expect(capturedMetrics[0]?.kind).toBe("counter");
      if (capturedMetrics[0]?.kind === "counter") {
        expect(capturedMetrics[0].value).toBe(1);
      }
      expect(capturedMetrics[1]?.kind).toBe("updown");
      if (capturedMetrics[1]?.kind === "updown") {
        expect(capturedMetrics[1].value).toBe(-1);
      }
      expect(capturedMetrics[2]?.kind).toBe("histogram");
      if (capturedMetrics[2]?.kind === "histogram") {
        expect(capturedMetrics[2].value).toBe(42);
      }
    });
  });
});
