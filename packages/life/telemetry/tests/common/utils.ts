import { vi } from "vitest";
import type { AsyncQueue } from "@/shared/async-queue";
import type { TelemetryClient } from "../../clients/base";
import type {
  TelemetryConsumer,
  TelemetryLog,
  TelemetryMetric,
  TelemetrySignal,
  TelemetrySpan,
} from "../../types";

export interface TestContext {
  createClient: () => TelemetryClient;
  expectedPlatform: "node" | "browser";
  supportsSpanHierarchy: boolean;
}

export interface TestHelpers {
  client: TelemetryClient;
  capturedSpans: TelemetrySpan[];
  capturedLogs: TelemetryLog[];
  capturedMetrics: TelemetryMetric[];
  allSignals: TelemetrySignal[];
  unregister: () => void;
  waitForSignals: (count: number, timeoutMs?: number) => Promise<void>;
  clearCaptures: () => void;
}

export function createTestHelpers(client: TelemetryClient): TestHelpers {
  const capturedSpans: TelemetrySpan[] = [];
  const capturedLogs: TelemetryLog[] = [];
  const capturedMetrics: TelemetryMetric[] = [];
  const allSignals: TelemetrySignal[] = [];

  const mockConsumer: TelemetryConsumer = {
    start: vi.fn((queue: AsyncQueue<TelemetrySignal>) => {
      const originalPush = queue.push.bind(queue);
      queue.push = vi.fn((signal: TelemetrySignal) => {
        allSignals.push(signal);
        if (signal.type === "span") {
          capturedSpans.push(signal as TelemetrySpan);
        } else if (signal.type === "log") {
          capturedLogs.push(signal as TelemetryLog);
        } else if (signal.type === "metric") {
          capturedMetrics.push(signal as TelemetryMetric);
        }
        return originalPush(signal);
      });
    }),
    isProcessing: vi.fn(() => false),
  };

  const unregister = client.registerConsumer(mockConsumer);

  const waitForSignals = async (count: number, timeoutMs = 1000): Promise<void> => {
    const startTime = Date.now();
    while (allSignals.length < count) {
      if (Date.now() - startTime > timeoutMs) {
        throw new Error(`Timeout waiting for ${count} signals. Got ${allSignals.length}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  };

  const clearCaptures = () => {
    capturedSpans.length = 0;
    capturedLogs.length = 0;
    capturedMetrics.length = 0;
    allSignals.length = 0;
  };

  return {
    client,
    capturedSpans,
    capturedLogs,
    capturedMetrics,
    allSignals,
    unregister,
    waitForSignals,
    clearCaptures,
  };
}

// Delay helper for async tests
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
