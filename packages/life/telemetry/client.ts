import { AsyncLocalStorage } from "node:async_hooks";
import os from "node:os";
import { AsyncQueue } from "@/shared/async-queue";
import { klona } from "@/shared/klona";
import { ns } from "@/shared/nanoseconds";
import packageJson from "../package.json" with { type: "json" };
import { AnonymousDataConsumer } from "./anonymous";
import { generateLogId, generateMetricId, generateSpanId, generateTraceId } from "./id";
import stripAnsi from "./strip-ansi";
import {
  type TelemetryAttributes,
  type TelemetryClient,
  type TelemetryConsumer,
  type TelemetryLog,
  type TelemetryLogInput,
  type TelemetryLogLevel,
  type TelemetryLogWriter,
  type TelemetryMetric,
  type TelemetryResource,
  type TelemetrySignal,
  type TelemetrySpan,
  type TelemetrySpanHandle,
  telemetryLogLevels,
} from "./types";

/**
 * The telemetry client provides a unified interface for logging, tracing, and metrics
 * collection across the Life.js codebase. It supports hierarchical client relationships
 * where child clients inherit consumers and attributes from their parents.
 * Telemetry data is then provider-agnostic and consumer classes can be simply written
 * to redirect and transform the data to a specific provider.
 * @dev Support auto-capture OTEL telemetry data from nested libraries.
 * @todo Properly parse and clean stack traces. Right now, we're using the raw stack trace string from the Error object.
 */
export class Telemetry implements TelemetryClient {
  readonly #parent?: Telemetry;
  readonly #resource: TelemetryResource;
  readonly #scope: string[];
  readonly #consumers: Array<{ instance: TelemetryConsumer; queue: AsyncQueue<TelemetrySignal> }> =
    [];
  readonly #globalAttributes: TelemetryAttributes = {};
  readonly #spanContext = new AsyncLocalStorage<TelemetrySpan | undefined>();

  constructor(opts: {
    parent?: Telemetry;
    resource: TelemetryResource;
    scope: string[];
  }) {
    this.#parent = opts.parent;
    this.#resource = opts.resource;
    this.#scope = opts.scope;
  }

  static logLevelPriority(level: TelemetryLogLevel) {
    if (level === "fatal") return 4;
    if (level === "error") return 3;
    if (level === "warn") return 2;
    if (level === "info") return 1;
    else return 0;
  }

  static parseLogLevel(level: string): TelemetryLogLevel {
    if (telemetryLogLevels.includes(level as TelemetryLogLevel)) return level as TelemetryLogLevel;
    return "info";
  }

  /**
   * Creates a child telemetry client with an extended scope.
   * The child inherits all consumers and attributes from this client dynamically.
   * @param name - The name of the new telemetry scope
   * @returns A new child telemetry client
   */
  child(name: string): Telemetry {
    return new Telemetry({
      parent: this,
      resource: this.#resource,
      scope: [...this.#scope, name],
    });
  }

  /**
   * Registers a callback consumer to receive telemetry data from this client.
   * Children of this telemetry client will implicitely inherit this consumer.
   * @param consumer - The consumer to register
   * @returns A function that unregisters the consumer when called
   * @example
   * ```typescript
   * const unregister = telemetry.registerConsumer(myConsumer);
   * unregister(); // Later, to stop receiving events
   * ```
   */
  registerConsumer(consumer: TelemetryConsumer): () => void {
    // Register the consumer (if not already registered)
    if (this.#consumers.some((c) => c.instance === consumer)) {
      this.log.error({
        message:
          "Attempted to register consumer that was already registered. This is unexpected and must be fixed.",
      });
      return () => null;
    }

    // Create a queue for this consumer
    const queue = new AsyncQueue<TelemetrySignal>();
    this.#consumers.push({ instance: consumer, queue });

    // Start the consumer with the queue
    consumer.start(queue);

    // Return a function to unregister that consumer later
    let unregistered = false;
    return () => {
      if (unregistered) return;

      // Find and remove the consumer
      const index = this.#consumers.findIndex((c) => c.instance === consumer);
      if (index !== -1) {
        this.#consumers[index]?.queue.stop();
        this.#consumers.splice(index, 1);
        unregistered = true;
      }
    };
  }

  /**
   * Sets a global attribute that will be included in all telemetry data from this client
   * and its children. Note that children clients can override this attribute.
   * @param key - The attribute key
   * @param value - The attribute value (must be serializable, else will be ignored)
   * @example
   * ```typescript
   * telemetry.setGlobalAttribute("modelId", "abc");
   * telemetry.setGlobalAttribute("region", "us-west-2");
   * ```
   */
  setGlobalAttribute(key: string, value: unknown): void {
    this.#globalAttributes[key] = value;
  }

  /**
   * Measure the duration and capture logs about an async operation.
   * trace().start() returns a span handle that can be used to log and set attributes
   * for the current operation. Note that spans can be nested, when called within an
   * existing span, the new span becomes a child of it.
   * @param name - The name of the operation being traced
   * @param attributes - Optional attributes to attach to the span
   * @returns `{ start: () => TelemetrySpanHandle }`
   * @example
   * ```typescript
   * // Using the using/dispose pattern (recommended):
   * using span = (await telemetry.trace("operation", { method: "GET" })).start();
   * span.log.info({ message: "Processing request" });
   * span.setAttribute("result", "success");
   * // span.end() called automatically on scope exit
   *
   * // Manual control:
   * using span = (await telemetry.trace("operation")).start();
   * try {
   *   // ... do work
   * } finally {
   *   span.end();
   * }
   * ```
   * @dev
   * Why relying on the using/dispose API?
   *
   * While the ASL API takes care of popping the async context when an async block exits,
   * it is totally blind to sync blocks, like if statements, loops, try/catch, sync callbacks, etc.
   * 'using' statement makes the trace API behaving consistently, no matter if the surrounding block.
   *
   * As a bonus, it offers a better DX, as tracing an entire block is just about adding this as first line.
   * using _ = (await trace("myFunction()")).start();
   *
   * With using/dispose, no need to think about ending the span, unless you want to end it early.
   * Also, there are no chances that ending is being forgotten or missed, so leading to never-ending
   * spans polluting the trace.
   */
  async trace(name: string, attributes?: TelemetryAttributes) {
    // Microtask hop to ensure proper async context isolation
    await Promise.resolve();

    let cachedHandle: TelemetrySpanHandle | undefined;
    /**
     * Starts the trace span. Must be stored in "using" statement.
     * @example
     * ```ts
     * using span = (await trace("My operation")).start();
     * ```
     * @returns The span handle
     */
    const start = (): TelemetrySpanHandle => {
      if (cachedHandle) {
        this.log.error({
          message: `Attempted to call 'start()' on already started span. This is unexpected and must be fixed.`,
          attributes: { name },
        });
        return cachedHandle as TelemetrySpanHandle;
      }

      // Create the span using our helper
      const { span, ...handleItems } = this.#createSpan(name, attributes);

      // Activate this span in this async resource
      this.#spanContext.enterWith(span);

      // Create and return the span handle
      const handle: TelemetrySpanHandle = {
        ...handleItems,
        [Symbol.dispose]: handleItems.end,
      };
      cachedHandle = handle;
      return handle;
    };

    return { start };
  }

  /**
   * Measure the duration and capture logs about a **sync** operation.
   * traceSync() calls can be nested and will produce nested spans as trace() does.
   * @see {@link trace} for asynchronous tracing.
   * @param name - The name of the operation being traced
   * @param fn - The function to execute within the span context
   * @param attributes - Optional attributes to attach to the span
   * @returns The result of the function
   * @example
   * ```typescript
   * const result = telemetry.traceSync("compute-hash", ({ log, setAttribute, end }) => {
   *   log.info({ message: "Computing hash" });
   *   const hash = computeHash(data);
   *   setAttribute("algorithm", "sha256");
   *   return hash;
   * }, { dataSize: data.length });
   *
   * // Early end example:
   * telemetry.traceSync("process-item", ({ end }) => {
   *   if (shouldSkip) {
   *     end();
   *     return;
   *   }
   *   // ... process item
   * });
   * ```
   */
  traceSync<F extends (params: Omit<TelemetrySpanHandle, typeof Symbol.dispose>) => unknown>(
    name: string,
    fn: F,
    attributes?: TelemetryAttributes,
  ): ReturnType<F> {
    // Create the span using our helper
    const { span, ...handleItems } = this.#createSpan(name, attributes);

    // Run the function in the span context
    return this.#spanContext.run(span, () => {
      try {
        return fn(handleItems) as ReturnType<F>;
      } finally {
        handleItems.end();
      }
    });
  }

  /**
   * Get the current tracing span parent.
   * @returns The current tracing span parent
   */
  getSpan() {
    return this.#spanContext.getStore();
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
        const fullMetric: TelemetryMetric = {
          id: generateMetricId(),
          resource: this.#resource,
          scope: this.#scope,
          attributes: { ...this.#allGlobalAttributes, ...attributes },
          name,
          kind: "counter",
          value: n,
        };
        for (const consumer of this.#allConsumers) {
          consumer.queue.push({ type: "metric", ...fullMetric });
        }
      },
      increment: (attributes?: TelemetryAttributes) => {
        this.counter(name).add(1, attributes);
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
        const fullMetric: TelemetryMetric = {
          id: generateMetricId(),
          resource: this.#resource,
          scope: this.#scope,
          attributes: { ...this.#allGlobalAttributes, ...attributes },
          name,
          kind: "updown",
          value: n,
        };
        for (const consumer of this.#allConsumers) {
          consumer.queue.push({ type: "metric", ...fullMetric });
        }
      },
      remove: (n: number | bigint, attributes?: TelemetryAttributes) => {
        this.updown(name).add(-n, attributes);
      },
      increment: (attributes?: TelemetryAttributes) => {
        this.updown(name).add(1, attributes);
      },
      decrement: (attributes?: TelemetryAttributes) => {
        this.updown(name).add(-1, attributes);
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
        const fullMetric: TelemetryMetric = {
          id: generateMetricId(),
          resource: this.#resource,
          scope: this.#scope,
          attributes: { ...this.#allGlobalAttributes, ...attributes },
          name,
          kind: "histogram",
          value,
        };
        for (const consumer of this.#allConsumers) {
          consumer.queue.push({ type: "metric", ...fullMetric });
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
  log: TelemetryLogWriter = {
    debug: (input) => this.#emitLog("debug", input),
    info: (input) => this.#emitLog("info", input),
    warn: (input) => this.#emitLog("warn", input),
    error: (input) => this.#emitLog("error", input),
    fatal: (input) => this.#emitLog("fatal", input),
  };

  /**
   * Flushes any pending telemetry data, ensuring that all consumers have finished
   * processing before returning or until the timeout is reached.
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000ms)
   * @returns A promise that resolves when flushing is complete or timeout is reached
   */
  async flush(timeoutMs = 10_000): Promise<void> {
    const startTime = Date.now();

    // Wait for all queues to be empty and consumers to finish processing
    while (Date.now() - startTime < timeoutMs) {
      // Check if all queues are empty and no consumers are processing
      let allDone = true;

      for (const { instance, queue } of this.#allConsumers) {
        if (queue.length() > 0 || instance.isProcessing?.()) {
          allDone = false;
          break;
        }
      }

      // Return if all consumers are idle
      if (allDone) return;

      // Wait a bit before checking again
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  // ========== Private Methods ==========

  /**
   * Get all consumers including inherited ones from parent chain
   */
  get #allConsumers(): Array<{ instance: TelemetryConsumer; queue: AsyncQueue<TelemetrySignal> }> {
    if (this.#parent) return [...this.#parent.#allConsumers, ...this.#consumers];
    return this.#consumers;
  }

  /**
   * Get all global attributes including inherited ones from parent chain
   * Child attributes override parent attributes with the same key
   */
  get #allGlobalAttributes(): TelemetryAttributes {
    if (this.#parent) return { ...this.#parent.#allGlobalAttributes, ...this.#globalAttributes };
    return this.#globalAttributes;
  }

  #endSpan(span: TelemetrySpan, parentSpan?: TelemetrySpan) {
    try {
      // Ignore if the span is already ended
      if (span.endTimestamp) return;

      // End the span
      span.endTimestamp = ns.now();
      span.duration = ns.since(span.startTimestamp);

      // Send span to all consumer queues
      for (const consumer of this.#allConsumers) consumer.queue.push({ type: "span", ...span });

      // Restore parent context (if any)
      if (parentSpan !== undefined) this.#spanContext.enterWith(parentSpan);
      else this.#spanContext.enterWith(undefined); // using dispose() might nuke the entire context
    } catch (error) {
      this.log.error({
        message: "Error ending span",
        error,
        attributes: { span },
      });
    }
  }

  /**
   * Private helper to create a span and its associated methods.
   * Used by both trace() and traceBlock() to avoid code duplication.
   */
  #createSpan(
    name: string,
    attributes?: TelemetryAttributes,
  ): {
    span: TelemetrySpan;
    end: () => void;
    setAttribute: (key: string, value: unknown) => void;
    setAttributes: (attributes: TelemetryAttributes) => void;
    log: TelemetryLogWriter;
    getSpan: () => Readonly<TelemetrySpan>;
  } {
    // Use explicit parent if provided, otherwise get from context
    const parentSpan = this.#spanContext.getStore();

    const span: TelemetrySpan = {
      id: generateSpanId(),
      resource: this.#resource,
      scope: this.#scope,
      attributes: { ...this.#allGlobalAttributes, ...attributes },
      name,
      startTimestamp: ns.now(),
      parentTraceId: parentSpan?.parentTraceId || generateTraceId(),
      parentSpanId: parentSpan?.id,
      logs: [],
    };

    // Create getSpan() method
    const getSpan = () => klona(span);

    // Create end() method
    const end = () => this.#endSpan(span, parentSpan);

    // Create setAttribute() method
    const setAttribute = (key: string, value: unknown) => {
      if (span.endTimestamp) {
        this.log.error({
          message:
            "Attempted to call 'setAttribute()' on already ended span. This is unexpected and must be fixed.",
          attributes: { span, key, value },
        });
        return;
      }
      span.attributes = span.attributes || {};
      span.attributes[key] = value;
    };

    // Create setAttributes() method
    const setAttributes = (_attributes: TelemetryAttributes) => {
      if (span.endTimestamp) {
        this.log.error({
          message:
            "Attempted to call 'setAttributes()' on already ended span. This is unexpected and must be fixed.",
          attributes: { span, attributes: _attributes },
        });
        return;
      }
      span.attributes = { ...span.attributes, ..._attributes };
    };

    // Create log.{level}() methods
    const createSpanLogMethod = (level: TelemetryLog["level"]) => (input: TelemetryLogInput) => {
      if (span.endTimestamp) {
        this.log.error({
          message: `Attempted to call 'log.${level}()' on already ended span. This is unexpected and must be fixed.`,
          attributes: { span, input },
        });
        return;
      }
      this.#emitLog(level, input, true);
    };
    const log: TelemetryLogWriter = {
      debug: createSpanLogMethod("debug"),
      info: createSpanLogMethod("info"),
      warn: createSpanLogMethod("warn"),
      error: createSpanLogMethod("error"),
      fatal: createSpanLogMethod("fatal"),
    };

    // Return the span and handling methods
    return { span, end, setAttribute, setAttributes, log, getSpan };
  }

  /**
   * Internal log method that handles all log levels
   */
  #emitLog(level: TelemetryLog["level"], input: TelemetryLogInput, isFromSpan = false): void {
    const parentSpan = this.#spanContext.getStore();

    // Extract message from input or error
    const error = input.error as Error | undefined;
    const message = "message" in input ? input.message : error?.message || "No message provided.";
    if (
      message === "No message provided." &&
      !("fromEmitLog" in input) // Prevent recursive error logs
    ) {
      this.log.error({
        message: "No message provided in log input or error. This is unexpected and must be fixed.",
        attributes: { level, input, isFromSpan, fromEmitLog: true },
      });
    }

    // Prepare log object
    const log: TelemetryLog = {
      id: generateLogId(),
      resource: this.#resource,
      scope: this.#scope,
      attributes: { ...this.#allGlobalAttributes, ...input.attributes },
      level,
      message,
      messageUnstyled: stripAnsi(message),
      timestamp: ns.now(),
      stack: error?.stack ?? new Error(".").stack ?? "unknown",
      isFromSpan,
      parentTraceId: isFromSpan ? parentSpan?.parentTraceId : undefined,
      parentSpanId: isFromSpan ? parentSpan?.id : undefined,
      error,
    };

    // Add to current span context if exists
    if (isFromSpan && parentSpan) parentSpan.logs.push(log);

    // Send to consumer queues (if log is not emitted from a span handle)
    for (const consumer of this.#allConsumers) consumer.queue.push({ type: "log", ...log });
  }
}

// ========== Root Telemetry Instance ==========

/**
 * The root telemetry instance for the Life.js framework.
 * This is the entry point for all the telemetry operations.
 * @example
 * ```typescript
 * import { telemetry } from "@life/telemetry";
 *
 * // Use directly
 * telemetry.log.info({ message: "Application started" });
 *
 * // Or create child clients for different services
 * const apiTelemetry = telemetry.child("api");
 * ```
 */
export const lifeTelemetry = new Telemetry({
  resource: {
    name: "life",
    version: packageJson.version,
    environment: (process.env.NODE_ENV || "development") as TelemetryResource["environment"],
    isCi: Boolean(process.env.CI),
    nodeVersion: process.version,
    osName: os.platform(),
    osVersion: os.release(),
    cpuCount: os.cpus().length,
    cpuArchitecture: os.arch(),
  },
  scope: ["life"],
});

// Register the anonymous data consumer if the project has not opted out
if (!process.env.LIFE_TELEMETRY_DISABLED) {
  lifeTelemetry.registerConsumer(new AnonymousDataConsumer());
}
