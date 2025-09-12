import z from "zod";

export const telemetryAttributeSchema = z.record(z.string(), z.unknown());

export const telemetryResourceSchema = z
  .object({
    environment: z.enum(["development", "production", "staging", "testing"]),
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
        schemaVersion: z.string().default("1"),
      }),
      z.object({
        platform: z.literal("browser"),
        deviceType: z.enum([
          "mobile",
          "tablet",
          "wearable",
          "smarttv",
          "console",
          "xr",
          "embedded",
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
        ]),
        isBot: z.boolean(),
        isAiBot: z.boolean(),
        schemaVersion: z.string().default("1"),
      }),
    ]),
  );

export const telemetryLogSchema = z.object({
  id: z.string(),
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
  traceId: z.string().optional(),
  spanId: z.string().optional(),
  error: z.custom<Error>().optional(),
});

export const telemetrySpanSchema = z.object({
  id: z.string(),
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
  traceId: z.string(),
  parentSpanId: z.string().optional(),
  logs: z.array(
    telemetryLogSchema.omit({ resource: true, scope: true, traceId: true, spanId: true }),
  ),
});

export const telemetryMetricSchema = z.object({
  id: z.string(),
  scope: z.string(),
  resource: telemetryResourceSchema,
  attributes: telemetryAttributeSchema.optional(),
  kind: z.enum(["counter", "updown", "histogram"]),
  name: z.string(),
  value: z.number().or(z.bigint()),
});

export const telemetrySignalSchema = z.discriminatedUnion("type", [
  telemetryLogSchema.extend({ type: z.literal("log") }),
  telemetrySpanSchema.extend({ type: z.literal("span") }),
  telemetryMetricSchema.extend({ type: z.literal("metric") }),
]);
