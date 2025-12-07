import z from "zod";
import { LOG_ID_BYTES, METRIC_ID_BYTES, SPAN_ID_BYTES, TRACE_ID_BYTES } from "./helpers/otel-id";

// Attributes
export const telemetryAttributeSchema = z.record(z.string(), z.unknown());

// Resource
export const telemetryResourceSchema = z
  .object({
    environment: z.enum(["development", "production", "staging", "test"]),
    lifeVersion: z.string(),
  })
  .and(
    z.discriminatedUnion("platform", [
      z.object({
        platform: z.literal("node"),
        isCi: z.boolean(),
        nodeVersion: z.string(),
        osName: z.string(),
        osVersion: z.string(),
        cpuCount: z.number(),
        cpuArchitecture: z.string(),
        schemaVersion: z.string().prefault("1"),
      }),
      z.object({
        platform: z.literal("browser"),
        deviceType: z.enum([
          "desktop",
          "mobile",
          "tablet",
          "wearable",
          "smarttv",
          "console",
          "xr",
          "embedded",
          "unknown",
        ]),
        deviceBrand: z.string(),
        deviceModel: z.string(),
        osName: z.string(),
        osVersion: z.string(),
        cpuArchitecture: z
          .enum([
            "ia32",
            "ia64",
            "amd64",
            "arm",
            "arm64",
            "armhf",
            "avr",
            "avr32",
            "irix",
            "irix64",
            "mips",
            "mips64",
            "68k",
            "pa-risc",
            "ppc",
            "sparc",
            "sparc64",
            "alpha",
            "unknown",
          ])
          .optional(),
        browserUserAgent: z.string(),
        browserName: z.string(),
        browserVersion: z.string(),
        browserEngine: z.enum([
          "Amaya",
          "ArkWeb",
          "Blink",
          "EdgeHTML",
          "Flow",
          "Gecko",
          "Goanna",
          "iCab",
          "KHTML",
          "LibWeb",
          "Links",
          "Lynx",
          "NetFront",
          "NetSurf",
          "Presto",
          "Servo",
          "Tasman",
          "Trident",
          "w3m",
          "WebKit",
          "unknown",
        ]),
        isBot: z.boolean(),
        isAiBot: z.boolean(),
        schemaVersion: z.string().prefault("1"),
      }),
    ]),
  );

// IDs
const HEX_LOWER_RE = /^[0-9a-f]+$/;
function createOtelHexIdSchema(bytes: number) {
  const len = bytes * 2;
  return z
    .string()
    .length(len, `expected ${len} lowercase hex chars`)
    .regex(HEX_LOWER_RE, "must be lowercase hex [0-9a-f]");
}
const telemetryTraceIdSchema = createOtelHexIdSchema(TRACE_ID_BYTES);
const telemetryLogIdSchema = createOtelHexIdSchema(LOG_ID_BYTES);
const telemetrySpanIdSchema = createOtelHexIdSchema(SPAN_ID_BYTES);
const telemetryMetricIdSchema = createOtelHexIdSchema(METRIC_ID_BYTES);

// Log
export const telemetryLogSchema = z.object({
  id: telemetryLogIdSchema,
  scope: z.string(),
  resource: telemetryResourceSchema,
  attributes: telemetryAttributeSchema.optional(),
  level: z.enum(["debug", "info", "warn", "error", "fatal"]),
  /**
   * The raw message with ANSI escape codes.
   * Useful for displaying in the terminal.
   * e.g., will preserve style of `chalk.bold.red("Hello")`
   */
  message: z.string(),
  /**
   * The message without any ANSI escape codes.
   * Useful for using messages outside of the terminal.
   */
  messageUnstyled: z.string(),
  timestamp: z.bigint(),
  stack: z.string(),
  traceId: telemetryTraceIdSchema.optional(),
  spanId: telemetrySpanIdSchema.optional(),
  error: z.custom<Error>().optional(),
});

// Span
export const telemetrySpanSchema = z.object({
  id: telemetrySpanIdSchema,
  scope: z.string(),
  resource: telemetryResourceSchema,
  attributes: telemetryAttributeSchema.optional(),
  name: z.string(),
  /**
   * The timestamp when the span started in nanoseconds.
   */
  startTimestamp: z.bigint(),
  /**
   * The timestamp when the span ended in nanoseconds.
   * Is undefined if the span hasn't ended yet.
   */
  endTimestamp: z.bigint(),
  /**
   * The duration of the span in nanoseconds.
   * Is undefined if the span hasn't ended yet.
   */
  duration: z.bigint(),
  traceId: telemetryTraceIdSchema,
  parentSpanId: z.string().optional(),
  logs: z.array(
    telemetryLogSchema.omit({ resource: true, scope: true, traceId: true, spanId: true }),
  ),
});

// Metric
export const telemetryMetricSchema = z.object({
  id: telemetryMetricIdSchema,
  scope: z.string(),
  resource: telemetryResourceSchema,
  attributes: telemetryAttributeSchema.optional(),
  kind: z.enum(["counter", "updown", "histogram"]),
  name: z.string(),
  value: z.number().or(z.bigint()),
});

// Signal
export const telemetrySignalSchema = z.discriminatedUnion("type", [
  telemetryLogSchema.extend({ type: z.literal("log") }),
  telemetrySpanSchema.extend({ type: z.literal("span") }),
  telemetryMetricSchema.extend({ type: z.literal("metric") }),
]);
