import { deepClone } from "@/shared/deep-clone";
import { ns } from "@/shared/nanoseconds";
import {
  generateLogId,
  generateMetricId,
  generateSpanId,
  generateTraceId,
} from "../helpers/otel-id";
import { registerConsumer } from "../helpers/register-consumer";
import stripAnsi from "../helpers/strip-ansi";
import type {
  TelemetryAttributes,
  TelemetryConsumer,
  TelemetryConsumerList,
  TelemetryLog,
  TelemetryLogHandle,
  TelemetryLogInput,
  TelemetryMetric,
  TelemetryResource,
  TelemetrySignal,
  TelemetrySpan,
  TelemetrySpanHandle,
} from "../types";

/**
 * The telemetry client provides a unified interface for logging, tracing, and metrics
 * collection across the Life.js codebase. The collected data is almost OTEL-compliant
 * and can be piped to any provider via consumers registering.
 *
 * @dev The program shouldn't fail or throw an error because of telemetry, so the
 * telemetry clients are not using the 'operation' library, they swallow and log any error.
 *
 * @todo Support auto-capture OTEL telemetry data from nested libraries.
 * @todo Properly parse and clean stack traces. Right now, we're using the raw stack trace string from the Error object.
 */
export abstract class TelemetryClient {
  static #clients: InstanceType<typeof TelemetryClient>[] = [];

  protected readonly scope: string;
  protected readonly resource: TelemetryResource;
  protected clientAttributes: TelemetryAttributes = {};

  constructor(scope: string) {
    this.scope = scope;
    this.resource = this.getResource();
    TelemetryClient.#clients.push(this);
  }

  // To be implemented by runtime-specific subclasses
  protected abstract getResource(): TelemetryResource;
  protected abstract getCurrentSpanData(): TelemetrySpan | undefined;
  protected abstract runWithSpanData(
    spanData: TelemetrySpan | undefined,
    fn: () => unknown,
  ): unknown;

  // Global consumers
  static readonly #globalConsumers: TelemetryConsumerList = [];
  /**
   * Registers a callback consumer to receive telemetry data from all the clients.
   * @param consumer - The consumer to register
   * @returns A function that unregisters the consumer when called
   * @example
   * ```typescript
   * const unregister = telemetry.registerGlobalConsumer(myConsumer);
   * unregister(); // Later, to stop receiving events
   * ```
   */
  static registerGlobalConsumer(consumer: TelemetryConsumer): () => void {
    return registerConsumer(consumer, TelemetryClient.#globalConsumers);
  }

  /**
   * Flushes any globally pending telemetry data, ensuring that all the consumers
   * of all the TelemetryClient instances have finished processing before returning
   * or until the timeout is reached.
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000ms)
   * @returns A promise that resolves when flushing is complete or timeout is reached
   */
  static async flushAllConsumers(timeoutMs = 10_000): Promise<void> {
    await Promise.all(TelemetryClient.#clients.map((client) => client.flushConsumers(timeoutMs)));
  }

  // Local consumers
  readonly #consumers: TelemetryConsumerList = [];
  /**
   * Registers a callback consumer to receive telemetry data from this client.
   * @param consumer - The consumer to register
   * @returns A function that unregisters the consumer when called
   * @example
   * ```typescript
   * const unregister = telemetry.registerConsumer(myConsumer);
   * unregister(); // Later, to stop receiving events
   * ```
   */
  registerConsumer(consumer: TelemetryConsumer): () => void {
    try {
      return registerConsumer(consumer, this.#consumers);
    } catch (error) {
      this.log.error({
        message: "Error registering telemetry consumer.",
        error,
        attributes: { consumer },
      });
      return () => {
        return;
      };
    }
  }

  /**
   * Flushes any pending telemetry data, ensuring that all consumers have finished
   * processing before returning or until the timeout is reached.
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000ms)
   * @returns A promise that resolves when flushing is complete or timeout is reached
   */
  async flushConsumers(timeoutMs = 10_000): Promise<void> {
    try {
      const startTime = Date.now();

      // Wait for all queues to be empty and consumers to finish processing
      while (Date.now() - startTime < timeoutMs) {
        let allDone = true;
        for (const { instance, queue } of this.#allConsumers) {
          if (queue.length() > 0 || instance.isProcessing?.()) {
            allDone = false;
            break;
          }
        }
        if (allDone) return;
        // biome-ignore lint/performance/noAwaitInLoops: sequential execution required here
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } catch (error) {
      // Swallow any error, but log it.
      this.log.error({
        message: "Error flushing telemetry consumers.",
        error,
        attributes: { timeoutMs },
      });
    }
  }

  /**
   * Sets a client-level attribute that will be included in all telemetry data from this client.
   * @param key - The attribute key
   * @param value - The attribute value (must be serializable, else will be ignored)
   * @example
   * ```typescript
   * telemetry.setAttribute("modelId", "abc");
   * telemetry.setAttribute("region", "us-west-2");
   * ```
   */
  setAttribute(key: string, value: unknown): void {
    this.clientAttributes[key] = value;
  }

  /**
   * Sets multiple client-level attributes that will be included in all telemetry data from this client.
   * @param attributes - The attributes to set
   * @example
   * ```typescript
   * telemetry.setAttributes({ modelId: "abc", region: "us-west-2" });
   * ```
   */
  setAttributes(attributes: TelemetryAttributes): void {
    this.clientAttributes = { ...this.clientAttributes, ...attributes };
  }

  /**
   * Measure the duration and capture logs about an operation.
   * Automatically handles both sync and async functions, preserving their return types.
   * trace() calls can be nested and will produce nested spans.
   * @param name - The name of the operation being traced
   * @param fn - The function to execute within the span context (sync or async)
   * @param options - Optional attributes and parent span
   * @returns The result of the function (direct value for sync, Promise for async)
   * @example
   * ```typescript
   * // Sync function - no await needed
   * const hash = telemetry.trace("compute-hash", ({ log, setAttribute }) => {
   *   log.info({ message: "Computing hash" });
   *   const result = computeHash(data);
   *   setAttribute("algorithm", "sha256");
   *   return result;
   * }, { attributes: { dataSize: data.length } });
   *
   * // Async function - await the result
   * const user = await telemetry.trace("fetch-user", async ({ log }) => {
   *   log.info({ message: "Fetching user" });
   *   const response = await fetch(`/api/users/${id}`);
   *   return response.json();
   * }, { attributes: { userId: id } });
   *
   * // Early end example:
   * telemetry.trace("process-item", ({ end }) => {
   *   if (shouldSkip) {
   *     end();
   *     return;
   *   }
   *   // ... process item
   * });
   * ```
   */
  trace<T>(
    name: string,
    fn: (params: TelemetrySpanHandle) => T,
    options: { attributes?: TelemetryAttributes; parent?: TelemetrySpanHandle } = {},
  ): T {
    // Use explicit parent if provided, otherwise get from context
    const parentSpan = options.parent ?? this.getCurrentSpan();
    const parentSpanData = parentSpan?.getData();

    // Build the span data
    const spanData: TelemetrySpan = {
      id: generateSpanId(),
      resource: this.resource,
      scope: this.scope,
      attributes: { ...options.attributes, ...this.clientAttributes },
      name,
      startTimestamp: ns.now(),
      endTimestamp: -1n,
      duration: -1n,
      traceId: parentSpanData?.traceId || generateTraceId(),
      parentSpanId: parentSpanData?.id,
      logs: [],
    };
    const span = this.#createSpanHandle(spanData);

    // Run the function in the span context
    return this.runWithSpanData(spanData, () => {
      try {
        const result = fn(span);

        // Async functions
        if (result instanceof Promise) return result.finally(() => span.end());

        // Sync functions
        span.end();
        return result;
      } catch (error) {
        // Ensure span is ended even on error
        span.end();
        throw error;
      }
    }) as T;
  }

  /**
   * Get the ambient tracing span handle.
   * @returns The current tracing span parent (if any)
   */
  getCurrentSpan() {
    const spanData = this.getCurrentSpanData();
    if (!spanData) return;
    return this.#createSpanHandle(spanData);
  }

  /**
   * Send a telemetry signal to all consumers.
   * This a raw method, prefer using log.*(), counter(), updown(), histogram(), etc.
   * @param signal - The telemetry signal to send
   */
  sendSignal(signal: TelemetrySignal): void {
    try {
      // Load signal with global attributes
      signal.attributes = { ...signal.attributes, ...this.clientAttributes };

      // Send to all consumers
      for (const consumer of this.#allConsumers) consumer.queue.push(signal);
    } catch (error) {
      // Swallow any error, but log it.
      this.log.error({
        message: "Error sending telemetry signal.",
        error,
        attributes: { signal },
      });
    }
  }

  /**
   * Creates a counter metric for tracking monotonically increasing values.
   * @param name - The name of the counter metric
   * @returns An object with methods to increment the counter
   * @example
   * ```typescript
   * const requestCounter = telemetry.counter("http_requests_total");
   * requestCounter.increment({ method: "GET", status: "200" });
   * requestCounter.add(5, { batch: "true" });
   * ```
   */
  counter(name: string) {
    return {
      add: (n: number | bigint, attributes?: TelemetryAttributes) => {
        try {
          const fullMetric: TelemetryMetric = {
            id: generateMetricId(),
            resource: this.resource,
            scope: this.scope,
            attributes,
            name,
            kind: "counter",
            value: n,
          };
          this.sendSignal({ type: "metric", ...fullMetric });
        } catch (error) {
          // Swallow any error, but log it.
          this.log.error({
            message: "Error adding to counter metric.",
            error,
            attributes: { name, n, attributes },
          });
        }
      },
      increment: (attributes?: TelemetryAttributes) => {
        try {
          this.counter(name).add(1, attributes);
        } catch (error) {
          // Swallow any error, but log it.
          this.log.error({
            message: "Error incrementing counter metric.",
            error,
            attributes: { name, attributes },
          });
        }
      },
    };
  }

  /**
   * Creates an up/down counter metric for tracking values that can increase or decrease.
   * @param name - The name of the up/down counter metric
   * @returns An object with methods to modify the counter
   * @example
   * ```typescript
   * const connectionGauge = telemetry.updown("active_connections");
   * connectionGauge.increment(); // New connection
   * connectionGauge.decrement(); // Connection closed
   * connectionGauge.add(10); // Bulk connections
   * ```
   */
  updown(name: string) {
    return {
      add: (n: number | bigint, attributes?: TelemetryAttributes) => {
        try {
          const fullMetric: TelemetryMetric = {
            id: generateMetricId(),
            resource: this.resource,
            scope: this.scope,
            attributes,
            name,
            kind: "updown",
            value: n,
          };
          this.sendSignal({ type: "metric", ...fullMetric });
        } catch (error) {
          // Swallow any error, but log it.
          this.log.error({
            message: "Error adding to updown metric.",
            error,
            attributes: { name, n, attributes },
          });
        }
      },
      remove: (n: number | bigint, attributes?: TelemetryAttributes) => {
        try {
          this.updown(name).add(-n, attributes);
        } catch (error) {
          // Swallow any error, but log it.
          this.log.error({
            message: "Error removing from updown metric.",
            error,
            attributes: { name, n, attributes },
          });
        }
      },
      increment: (attributes?: TelemetryAttributes) => {
        try {
          this.updown(name).add(1, attributes);
        } catch (error) {
          this.log.error({
            message: "Error incrementing updown metric.",
            error,
            attributes: { name, attributes },
          });
        }
      },
      decrement: (attributes?: TelemetryAttributes) => {
        try {
          this.updown(name).add(-1, attributes);
        } catch (error) {
          this.log.error({
            message: "Error decrementing updown metric.",
            error,
            attributes: { name, attributes },
          });
        }
      },
    };
  }

  /**
   * Creates a histogram metric for recording value distributions over time.
   * @param name - The name of the histogram metric
   * @returns An object with a method to record values
   * @example
   * ```typescript
   * const latencyHistogram = telemetry.histogram("request_duration_ms");
   * latencyHistogram.record(responseTime, { endpoint: "/api/users" });
   * ```
   */
  histogram(name: string) {
    return {
      record: (value: number | bigint, attributes?: TelemetryAttributes) => {
        try {
          const fullMetric: TelemetryMetric = {
            id: generateMetricId(),
            resource: this.resource,
            scope: this.scope,
            attributes,
            name,
            kind: "histogram",
            value,
          };
          this.sendSignal({ type: "metric", ...fullMetric });
        } catch (error) {
          // Swallow any error, but log it.
          this.log.error({
            message: "Error recording histogram metric.",
            error,
            attributes: { name, value, attributes },
          });
        }
      },
    };
  }

  /**
   * Log writer for recording events at different severity levels.
   * Logs are automatically associated with the current span context if one exists.
   * @example
   * ```typescript
   * telemetry.log.info({ message: "Server started", attributes: { port: 3000 } });
   * telemetry.log.error({ error: new Error("Connection failed"), attributes: { host: "db.example.com" } });
   * telemetry.log.warn({ message: "Deprecated API used", attributes: { endpoint: "/v1/users" } });
   * ```
   */
  log: TelemetryLogHandle = {
    debug: (input) => this.#emitLog("debug", input),
    info: (input) => this.#emitLog("info", input),
    warn: (input) => this.#emitLog("warn", input),
    error: (input) => this.#emitLog("error", input),
    fatal: (input) => this.#emitLog("fatal", input),
  };

  // ========== Private Methods ==========

  /**
   * Get all consumers.
   * Including local and global consumers.
   */
  get #allConsumers(): TelemetryConsumerList {
    return this.#consumers.concat(TelemetryClient.#globalConsumers);
  }

  #endSpan(spanData: TelemetrySpan) {
    try {
      // Ignore if the span is already ended
      if (spanData.endTimestamp !== -1n) return;

      // End the span
      spanData.endTimestamp = ns.now();
      spanData.duration = ns.since(spanData.startTimestamp);

      // Send span to all consumer queues
      this.sendSignal({ type: "span", ...spanData });
    } catch (error) {
      this.log.error({
        message: "Error ending span.",
        error,
        attributes: { span: spanData },
      });
    }
  }

  /**
   * Private helper to create a span and its associated methods.
   * Used by both trace() and traceBlock() to avoid code duplication.
   */
  #createSpanHandle(spanData: TelemetrySpan): TelemetrySpanHandle {
    // Create getData() method
    const getData = () => deepClone(spanData);

    // Create _getWritableData() method
    const _getWritableData = () => spanData;

    // Create end() method
    const end = () => this.#endSpan(spanData);

    // Create setAttribute() method
    const setAttribute = (key: string, value: unknown) => {
      if (spanData.endTimestamp !== -1n) {
        this.log.error({
          message:
            "Attempted to call 'setAttribute()' on already ended span. This is unexpected and must be fixed.",
          attributes: { span: spanData, key, value },
        });
        return;
      }
      spanData.attributes = spanData.attributes || {};
      spanData.attributes[key] = value;
    };

    // Create setAttributes() method
    const setAttributes = (_attributes: TelemetryAttributes) => {
      if (spanData.endTimestamp !== -1n) {
        this.log.error({
          message:
            "Attempted to call 'setAttributes()' on already ended span. This is unexpected and must be fixed.",
          attributes: { span: spanData, attributes: _attributes },
        });
        return;
      }
      spanData.attributes = { ...spanData.attributes, ..._attributes };
    };

    // Build the span handle
    const span = { end, setAttribute, setAttributes, getData, _getWritableData };

    // Create log.{level}() methods
    const createSpanLogMethod =
      (level: TelemetryLog["level"]) => (input: Omit<TelemetryLogInput, "span">) => {
        if (spanData.endTimestamp !== -1n) {
          this.log.error({
            message: `Attempted to call 'log.${level}()' on already ended span. This is unexpected and must be fixed.`,
            attributes: { span: spanData, input },
          });
          return;
        }
        this.#emitLog(level, { ...input, span } as TelemetryLogInput);
      };
    const log: TelemetryLogHandle = {
      debug: createSpanLogMethod("debug"),
      info: createSpanLogMethod("info"),
      warn: createSpanLogMethod("warn"),
      error: createSpanLogMethod("error"),
      fatal: createSpanLogMethod("fatal"),
    };

    // Add log methods to span
    Object.assign(span, { log });

    // Return the span and handle
    return span as TelemetrySpanHandle;
  }

  /**
   * Internal log method that handles all log levels
   */
  #emitLog(level: TelemetryLog["level"], input: TelemetryLogInput): void {
    try {
      const spanData = input.span?._getWritableData() ?? this.getCurrentSpanData();

      // Extract message from input or error
      const error = input.error as Error | undefined;
      const message = "message" in input ? input.message : error?.message || "No message provided.";
      if (
        message === "No message provided." &&
        !("fromEmitLog" in input) // Prevent recursive error logs
      ) {
        this.log.error({
          message:
            "No message provided in log input or error. This is unexpected and must be fixed.",
          attributes: { level, input, fromEmitLog: true },
        });
      }

      // Prepare log object
      const log: TelemetryLog = {
        id: generateLogId(),
        resource: this.resource,
        scope: this.scope,
        attributes: input.attributes,
        level,
        message,
        messageUnstyled: stripAnsi(message),
        timestamp: ns.now(),
        stack: error?.stack ?? new Error(".").stack ?? "unknown",
        traceId: spanData?.traceId,
        spanId: spanData?.id,
        error,
      };

      // Add to current span context if exists
      if (input.span && spanData) spanData.logs.push(log);

      // Send to consumer queues
      this.sendSignal({ type: "log", ...log });
    } catch (error) {
      // Swallow any error, but log it.
      this.log.error({
        message: "Error emitting log.",
        error,
        attributes: { level, input },
      });
    }
  }
}
