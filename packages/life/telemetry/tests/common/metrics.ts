// biome-ignore-all lint: test file

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TestContext, TestHelpers } from "./utils";
import { createTestHelpers } from "./utils";

export function createMetricsTests(context: TestContext) {
  describe("TelemetryClient - Metrics", () => {
    let helpers: TestHelpers;

    beforeEach(() => {
      helpers = createTestHelpers(context.createClient());
    });

    afterEach(() => {
      helpers.unregister();
    });

    describe("Counter", () => {
      it("should increment counter by 1", () => {
        const { client, capturedMetrics } = helpers;
        const counter = client.counter("test_counter");

        counter.increment();

        expect(capturedMetrics).toHaveLength(1);
        expect(capturedMetrics[0]).toMatchObject({
          name: "test_counter",
          kind: "counter",
          value: 1,
        });
      });

      it("should increment counter with attributes", () => {
        const { client, capturedMetrics } = helpers;
        const counter = client.counter("requests_total");

        counter.increment({ method: "GET", status: "200" });
        counter.increment({ method: "POST", status: "201" });

        expect(capturedMetrics).toHaveLength(2);
        expect(capturedMetrics[0]).toMatchObject({
          kind: "counter",
          value: 1,
          attributes: { method: "GET", status: "200" },
        });
        expect(capturedMetrics[1]).toMatchObject({
          kind: "counter",
          value: 1,
          attributes: { method: "POST", status: "201" },
        });
      });

      it("should add custom values to counter", () => {
        const { client, capturedMetrics } = helpers;
        const counter = client.counter("bytes_processed");

        counter.add(100);
        counter.add(250);
        counter.add(1000, { batch: "true" });

        expect(capturedMetrics).toHaveLength(3);
        expect(capturedMetrics[0]?.value).toBe(100);
        expect(capturedMetrics[1]?.value).toBe(250);
        expect(capturedMetrics[2]).toMatchObject({
          value: 1000,
          attributes: { batch: "true" },
        });
      });

      it("should support BigInt values", () => {
        const { client, capturedMetrics } = helpers;
        const counter = client.counter("large_counter");

        counter.add(BigInt("9007199254740992")); // Larger than MAX_SAFE_INTEGER

        expect(capturedMetrics).toHaveLength(1);
        expect(capturedMetrics[0]?.value).toBe(BigInt("9007199254740992"));
      });

      it("should include client attributes", () => {
        const { client, capturedMetrics } = helpers;

        client.setAttribute("service", "api");
        const counter = client.counter("requests");

        counter.increment();

        expect(capturedMetrics[0]?.attributes).toMatchObject({
          service: "api",
        });
      });

      it("should handle multiple counters independently", () => {
        const { client, capturedMetrics } = helpers;

        const counter1 = client.counter("counter1");
        const counter2 = client.counter("counter2");

        counter1.increment();
        counter2.add(5);
        counter1.add(10);

        expect(capturedMetrics).toHaveLength(3);
        expect(capturedMetrics[0]).toMatchObject({ name: "counter1", value: 1 });
        expect(capturedMetrics[1]).toMatchObject({ name: "counter2", value: 5 });
        expect(capturedMetrics[2]).toMatchObject({ name: "counter1", value: 10 });
      });
    });

    describe("UpDown Counter", () => {
      it("should increment and decrement", () => {
        const { client, capturedMetrics } = helpers;
        const updown = client.updown("active_connections");

        updown.increment();
        updown.increment();
        updown.decrement();

        expect(capturedMetrics).toHaveLength(3);
        expect(capturedMetrics[0]?.value).toBe(1);
        expect(capturedMetrics[1]?.value).toBe(1);
        expect(capturedMetrics[2]?.value).toBe(-1);
      });

      it("should add and remove custom values", () => {
        const { client, capturedMetrics } = helpers;
        const updown = client.updown("memory_usage");

        updown.add(1024);
        updown.remove(256);
        updown.add(512);
        updown.remove(128);

        expect(capturedMetrics).toHaveLength(4);
        expect(capturedMetrics[0]?.value).toBe(1024);
        expect(capturedMetrics[1]?.value).toBe(-256);
        expect(capturedMetrics[2]?.value).toBe(512);
        expect(capturedMetrics[3]?.value).toBe(-128);
      });

      it("should support negative values directly", () => {
        const { client, capturedMetrics } = helpers;
        const updown = client.updown("balance");

        updown.add(-100);
        updown.add(50);
        updown.add(-25);

        expect(capturedMetrics).toHaveLength(3);
        expect(capturedMetrics[0]?.value).toBe(-100);
        expect(capturedMetrics[1]?.value).toBe(50);
        expect(capturedMetrics[2]?.value).toBe(-25);
      });

      it("should handle attributes", () => {
        const { client, capturedMetrics } = helpers;
        const updown = client.updown("queue_size");

        updown.increment({ queue: "high_priority" });
        updown.decrement({ queue: "high_priority" });
        updown.add(10, { queue: "low_priority" });
        updown.remove(5, { queue: "low_priority" });

        expect(capturedMetrics).toHaveLength(4);
        expect(capturedMetrics[0]).toMatchObject({
          value: 1,
          attributes: { queue: "high_priority" },
        });
        expect(capturedMetrics[3]).toMatchObject({
          value: -5,
          attributes: { queue: "low_priority" },
        });
      });

      it("should support BigInt values", () => {
        const { client, capturedMetrics } = helpers;
        const updown = client.updown("large_gauge");

        updown.add(BigInt("9007199254740992"));
        updown.remove(BigInt("1000000000000"));

        expect(capturedMetrics).toHaveLength(2);
        expect(capturedMetrics[0]?.value).toBe(BigInt("9007199254740992"));
        expect(capturedMetrics[1]?.value).toBe(BigInt("-1000000000000"));
      });
    });

    describe("Histogram", () => {
      it("should record single values", () => {
        const { client, capturedMetrics } = helpers;
        const histogram = client.histogram("response_time_ms");

        histogram.record(150);
        histogram.record(250);
        histogram.record(100);

        expect(capturedMetrics).toHaveLength(3);
        expect(capturedMetrics[0]).toMatchObject({
          name: "response_time_ms",
          kind: "histogram",
          value: 150,
        });
        expect(capturedMetrics[1]?.value).toBe(250);
        expect(capturedMetrics[2]?.value).toBe(100);
      });

      it("should record values with attributes", () => {
        const { client, capturedMetrics } = helpers;
        const histogram = client.histogram("request_duration");

        histogram.record(200, { endpoint: "/api/users", method: "GET" });
        histogram.record(500, { endpoint: "/api/posts", method: "POST" });
        histogram.record(150, { endpoint: "/api/users", method: "GET" });

        expect(capturedMetrics).toHaveLength(3);
        expect(capturedMetrics[0]).toMatchObject({
          value: 200,
          attributes: { endpoint: "/api/users", method: "GET" },
        });
        expect(capturedMetrics[1]).toMatchObject({
          value: 500,
          attributes: { endpoint: "/api/posts", method: "POST" },
        });
      });

      it("should support floating point values", () => {
        const { client, capturedMetrics } = helpers;
        const histogram = client.histogram("cpu_usage_percent");

        histogram.record(45.5);
        histogram.record(78.9);
        histogram.record(92.1);

        expect(capturedMetrics).toHaveLength(3);
        expect(capturedMetrics[0]?.value).toBe(45.5);
        expect(capturedMetrics[1]?.value).toBe(78.9);
        expect(capturedMetrics[2]?.value).toBe(92.1);
      });

      it("should support BigInt values", () => {
        const { client, capturedMetrics } = helpers;
        const histogram = client.histogram("file_size_bytes");

        histogram.record(BigInt("1099511627776")); // 1TB in bytes

        expect(capturedMetrics).toHaveLength(1);
        expect(capturedMetrics[0]?.value).toBe(BigInt("1099511627776"));
      });

      it("should handle zero and negative values", () => {
        const { client, capturedMetrics } = helpers;
        const histogram = client.histogram("temperature");

        histogram.record(0);
        histogram.record(-10);
        histogram.record(25);

        expect(capturedMetrics).toHaveLength(3);
        expect(capturedMetrics[0]?.value).toBe(0);
        expect(capturedMetrics[1]?.value).toBe(-10);
        expect(capturedMetrics[2]?.value).toBe(25);
      });
    });

    describe("Metric Metadata", () => {
      it("should include metric ID", () => {
        const { client, capturedMetrics } = helpers;

        client.counter("test").increment();
        client.updown("test").increment();
        client.histogram("test").record(100);

        expect(capturedMetrics).toHaveLength(3);
        capturedMetrics.forEach((metric) => {
          expect(metric.id).toBeDefined();
          expect(typeof metric.id).toBe("string");
        });

        // All IDs should be unique
        const ids = capturedMetrics.map((m) => m.id);
        expect(new Set(ids).size).toBe(3);
      });

      it("should include resource information", () => {
        const { client, capturedMetrics } = helpers;

        client.counter("test").increment();

        expect(capturedMetrics[0]?.resource).toBeDefined();
        expect(capturedMetrics[0]?.resource.platform).toBe(context.expectedPlatform);
      });

      it("should include scope", () => {
        const { client, capturedMetrics } = helpers;

        client.counter("test").increment();

        expect(capturedMetrics[0]?.scope).toBeDefined();
        expect(typeof capturedMetrics[0]?.scope).toBe("string");
      });
    });

    describe("Metrics in Spans", () => {
      it("should emit metrics within span context", () => {
        const { client, capturedMetrics, capturedSpans } = helpers;

        client.trace("operation", () => {
          client.counter("ops_count").increment();
          client.histogram("op_duration").record(100);
        });

        expect(capturedSpans).toHaveLength(1);
        expect(capturedMetrics).toHaveLength(2);

        // Metrics are independent of spans (no span association in metrics)
        expect(capturedMetrics[0]?.name).toBe("ops_count");
        expect(capturedMetrics[1]?.name).toBe("op_duration");
      });

      it("should handle metrics in nested spans", () => {
        const { client, capturedMetrics } = helpers;

        client.trace("outer", (outerHandle) => {
          client.counter("outer_counter").increment();

          client.trace(
            "inner",
            () => {
              client.counter("inner_counter").increment();
              client.histogram("inner_hist").record(50);
            },
            { parent: outerHandle },
          );

          client.updown("outer_gauge").add(10);
        });

        expect(capturedMetrics).toHaveLength(4);
        expect(capturedMetrics.map((m) => m.name)).toEqual([
          "outer_counter",
          "inner_counter",
          "inner_hist",
          "outer_gauge",
        ]);
      });
    });

    describe("Error Handling", () => {
      it("should handle errors gracefully without throwing", () => {
        const { client, capturedMetrics } = helpers;

        // Even with invalid values, should not throw
        expect(() => {
          client.counter("test").add(Number.NaN);
          client.counter("test").add(Number.POSITIVE_INFINITY);
          client.counter("test").add(Number.NEGATIVE_INFINITY);
        }).not.toThrow();

        // Metrics might still be captured (implementation dependent)
        // Main point is no exceptions thrown
      });

      it("should continue working after errors", () => {
        const { client, capturedMetrics } = helpers;

        // Cause potential error
        client.counter("test").add(undefined as any);

        // Should still work normally
        client.counter("test").increment();

        // At least the valid increment should be captured
        const validMetric = capturedMetrics.find((m) => m.value === 1);
        expect(validMetric).toBeDefined();
      });
    });
  });
}
