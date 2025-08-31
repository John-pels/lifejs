import type { AsyncQueue } from "@/shared/async-queue";

// Can be Pino, can be OTEL, can be a specific provider implementation (e.g., Sentry, Datadog)
export interface TelemetryConsumer {
  isProcessing?(): boolean;
  start(queue: AsyncQueue<TelemetrySignal>): void;
}

export type TelemetryAttributes = Record<string, unknown>;

// - Resource
export interface TelemetryResource {
  name: string;
  version: string;
  environment: "development" | "production" | "staging" | "testing";
  isCi: boolean;
  nodeVersion: string;
  osName: string;
  osVersion: string;
  cpuCount: number;
  cpuArchitecture: string;
}

// - Log
export const telemetryLogLevels = ["debug", "info", "warn", "error", "fatal"] as const;
export type TelemetryLogLevel = (typeof telemetryLogLevels)[number];
export interface TelemetryLog {
  id: string;
  resource: TelemetryResource; // Life.js version, OS, environment, etc.
  scope: string[]; // e.g. ["life", "orchestrator", "agent:123"]
  attributes?: TelemetryAttributes;

  level: TelemetryLogLevel;
  /**
   * The raw message with ANSI escape codes.
   * Useful for displaying in the terminal.
   * e.g., will preserve style of `chalk.bold.red("Hello")`
   */
  message: string;
  /**
   * The message without any ANSI escape codes.
   * Useful for using messages outside of the terminal.
   */
  messageUnstyled: string;
  timestamp: bigint;
  stack: string;
  isFromSpan: boolean;
  parentTraceId?: string;
  parentSpanId?: string;
  error?: Error;
}

// - Span
export interface TelemetrySpan {
  id: string;
  resource: TelemetryResource;
  scope: string[];
  attributes?: TelemetryAttributes;

  name: string;
  /**
   * The timestamp when the span started in nanoseconds.
   */
  startTimestamp: bigint;
  /**
   * The timestamp when the span ended in nanoseconds.
   * Is undefined if the span hasn't ended yet.
   */
  endTimestamp?: bigint;
  /**
   * The duration of the span in nanoseconds.
   * Is undefined if the span hasn't ended yet.
   */
  duration?: bigint;
  parentTraceId: string;
  parentSpanId?: string;
  logs: Omit<TelemetryLog, "resource" | "scope" | "parentTraceId" | "parentSpanId">[];
}

// - Metric
export type TelemetryMetric = {
  id: string;
  resource: TelemetryResource;
  scope: string[];
  attributes?: TelemetryAttributes;

  kind: "counter" | "updown" | "histogram";
  name: string;
  value: number | bigint;
};

// - Signal
export type TelemetrySignal =
  | ({ type: "log" } & TelemetryLog)
  | ({ type: "span" } & TelemetrySpan)
  | ({ type: "metric" } & TelemetryMetric);

// - Log Writer
export type TelemetryLogInput = { attributes?: TelemetryAttributes } & (
  | { message: string; error?: Error | unknown }
  | { error: Error | unknown }
);
export interface TelemetryLogWriter {
  debug(log: TelemetryLogInput): void;
  info(log: TelemetryLogInput): void;
  warn(log: TelemetryLogInput): void;
  error(log: TelemetryLogInput): void;
  fatal(log: TelemetryLogInput): void;
}

// - Span Handle
export interface TelemetrySpanHandle {
  /**
   * Returns a read-only clone of the span.
   * Mutating this span object will not affect the original span.
   * @returns A read-only clone of the span.
   */
  getSpan(): Readonly<TelemetrySpan>;
  setAttribute(key: string, val: unknown): void;
  setAttributes(attributes: TelemetryAttributes): void;
  log: TelemetryLogWriter;
  end(): void;
  [Symbol.dispose](): void;
}

// - Client
export interface TelemetryClient {
  child(name: string): TelemetryClient;
  setGlobalAttribute(key: string, value: unknown): void;
  registerConsumer(consumer: TelemetryConsumer): () => void;
  log: TelemetryLogWriter;
  trace(name: string, attributes?: TelemetryAttributes): Promise<{ start(): TelemetrySpanHandle }>;
  traceSync<R>(
    name: string,
    fn: (params: {
      setAttribute: (key: string, value: unknown) => void;
      log: TelemetryLogWriter;
      end: () => void;
    }) => R,
    attributes?: TelemetryAttributes,
  ): R;
  counter(name: string): {
    add(n: number, attributes?: TelemetryAttributes): void;
    increment(attributes?: TelemetryAttributes): void;
  };
  updown(name: string): {
    add(n: number | bigint, attributes?: TelemetryAttributes): void;
    remove(n: number | bigint, attributes?: TelemetryAttributes): void;
    increment(attributes?: TelemetryAttributes): void;
    decrement(attributes?: TelemetryAttributes): void;
  };
  histogram(name: string): {
    record(v: number | bigint, attributes?: TelemetryAttributes): void;
  };
  flush(): Promise<void>;
}
