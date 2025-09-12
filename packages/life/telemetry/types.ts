import type z from "zod";
import type { AsyncQueue } from "@/shared/async-queue";
import type {
  telemetryLogSchema,
  telemetryMetricSchema,
  telemetryResourceSchema,
  telemetrySignalSchema,
  telemetrySpanSchema,
} from "./schemas";

// - Scope
export type TelemetryScopeDefinition<Schema extends z.AnyZodObject = z.AnyZodObject> = {
  requiredAttributesSchema: Schema;
  displayName?: string | ((attributes: z.infer<Schema>) => string);
  isFromBrowser?: boolean;
};

// - Attributes
export type TelemetryAttributes = Record<string, unknown>;

// - Signal
export type TelemetryResource = z.infer<typeof telemetryResourceSchema>;
export type TelemetryLog = z.infer<typeof telemetryLogSchema>;
export type TelemetrySpan = z.infer<typeof telemetrySpanSchema>;
export type TelemetryMetric = z.infer<typeof telemetryMetricSchema>;
export type TelemetrySignal = z.infer<typeof telemetrySignalSchema>;

// - Consumer
export interface TelemetryConsumer {
  isProcessing?(): boolean;
  start(queue: AsyncQueue<TelemetrySignal>): void;
}

// - Log Level
export type TelemetryLogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export const telemetryLogLevels = ["debug", "info", "warn", "error", "fatal"] as const;

// - Log Handle
export type TelemetryLogInput = { attributes?: TelemetryAttributes } & (
  | { message: string; error?: Error | unknown }
  | { error: Error | unknown }
);
export interface TelemetryLogHandle {
  debug(log: TelemetryLogInput): void;
  info(log: TelemetryLogInput): void;
  warn(log: TelemetryLogInput): void;
  error(log: TelemetryLogInput): void;
  fatal(log: TelemetryLogInput): void;
}

// - Span Handle
export interface TelemetrySpanHandle {
  /**
   * Returns a read-only clone of the span data.
   * Mutating this span object will not affect the original span.
   * @returns A read-only clone of the span.
   */
  getData(): Readonly<TelemetrySpan>;
  setAttribute(key: string, val: unknown): void;
  setAttributes(attributes: TelemetryAttributes): void;
  log: TelemetryLogHandle;
  end(): void;
}
