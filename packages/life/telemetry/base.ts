import type z from "zod";
import { AsyncQueue } from "@/shared/async-queue";
import { deepClone } from "@/shared/deep-clone";
import { ns } from "@/shared/nanoseconds";
import {
  generateLogId,
  generateMetricId,
  generateSpanId,
  generateTraceId,
} from "./helpers/otel-id";
import stripAnsi from "./helpers/strip-ansi";
import { telemetryScopesDefinitions } from "./scopes";
import type {
  TelemetryAttributes,
  TelemetryConsumer,
  TelemetryLog,
  TelemetryLogHandle,
  TelemetryLogInput,
  TelemetryMetric,
  TelemetryResource,
  TelemetrySignal,
  TelemetrySpan,
  TelemetrySpanHandle,
} from "./types";

type TelemetryConsumerList = Array<{
  instance: TelemetryConsumer;
  queue: AsyncQueue<TelemetrySignal>;
}>;

const registerConsumer = (consumer: TelemetryConsumer, list: TelemetryConsumerList) => {
  // Create a queue for this consumer
  const queue = new AsyncQueue<TelemetrySignal>();
  list.push({ instance: consumer, queue });

  // Start the consumer with the queue
  consumer.start(queue);

  // Return a function to unregister that consumer later
  let unregistered = false;
  return () => {
    if (unregistered) return;

    // Find and remove the consumer
    const index = list.findIndex((c) => c.instance === consumer);
    if (index !== -1) {
      list[index]?.queue.stop();
      list.splice(index, 1);
      unregistered = true;
    }
  };
};

/**
 * The telemetry client provides a unified interface for logging, tracing, and metrics
 * collection across the Life.js codebase. The collected data is almost OTEL-compliant
 * and can be piped to any provider via consumers registering.
 *
 * @dev The program shouldn't fail or throw an error because of telemetry, so the
 * telemetry clients are not using the 'operation' library, they swallow any throw.
 *
 * @todo Support auto-capture OTEL telemetry data from nested libraries.
 * @todo Properly parse and clean stack traces. Right now, we're using the raw stack trace string from the Error object.
 */
export abstract class TelemetryClient {
  static #clients: InstanceType<typeof TelemetryClient>[] = [];

  protected readonly scope: string;
  protected readonly resource: TelemetryResource;
  protected readonly globalAttributes: TelemetryAttributes = {};

  constructor(scope: string) {
    this.scope = scope;
    this.resource = this.getResource();
    TelemetryClient.#clients.push(this);
  }

  // To be implemented by runtime-specific subclasses
  protected abstract getResource(): TelemetryResource;
  protected abstract getCurrentSpanData(): TelemetrySpan | undefined;
  protected abstract enterContextWith(spanData: TelemetrySpan | undefined): void;
  protected abstract runContextWith(spanData: TelemetrySpan | undefined, fn: () => unknown): void;

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
    return registerConsumer(consumer, this.#consumers);
  }

  /**
   * Flushes any pending telemetry data, ensuring that all consumers have finished
   * processing before returning or until the timeout is reached.
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 10000ms)
   * @returns A promise that resolves when flushing is complete or timeout is reached
   */
  async flushConsumers(timeoutMs = 10_000): Promise<void> {
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
    this.globalAttributes[key] = value;
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

    let cachedHandle: (TelemetrySpanHandle & { [Symbol.dispose]: () => void }) | undefined;
    /**
     * Starts the trace span. Must be stored in "using" statement.
     * @example
     * ```ts
     * using span = (await trace("My operation")).start();
     * ```
     * @returns The span handle
     */
    const start = (): TelemetrySpanHandle & { [Symbol.dispose]: () => void } => {
      if (cachedHandle) {
        this.log.error({
          message: `Attempted to call 'start()' on already started span. This is unexpected and must be fixed.`,
          attributes: { name },
        });
        return cachedHandle;
      }

      // Create the span using our helper
      const [spanData, rawHandle] = this.#createSpan({ name, attributes });
      const handle = {
        ...rawHandle,
        [Symbol.dispose]: () => handle.end(),
      };

      // Activate this span in this async resource
      this.enterContextWith(spanData);

      // Create and return the span handle
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
    const [spanData, handle] = this.#createSpan({ name, attributes });

    // Run the function in the span context
    return this.runContextWith(spanData, () => {
      try {
        return fn(handle);
      } finally {
        handle.end();
      }
    }) as ReturnType<F>;
  }

  /**
   * Get the current tracing span parent.
   * @returns The current tracing span parent
   */
  getCurrentSpan() {
    const spanData = this.getCurrentSpanData();
    if (!spanData) return spanData;
    const [_, handle] = this.#createSpan({ spanData });
    return handle;
  }

  /**
   * Send a telemetry signal to all consumers.
   * This a raw method, prefer using log.*(), counter(), updown(), histogram(), etc.
   * @param signal - The telemetry signal to send
   */
  sendSignal(signal: TelemetrySignal): void {
    // Load signal with global attributes
    signal.attributes = { ...signal.attributes, ...this.globalAttributes };

    // Send to all consumers
    for (const consumer of this.#allConsumers) consumer.queue.push(signal);
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
          resource: this.resource,
          scope: this.scope,
          attributes,
          name,
          kind: "counter",
          value: n,
        };
        this.sendSignal({ type: "metric", ...fullMetric });
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
          resource: this.resource,
          scope: this.scope,
          attributes,
          name,
          kind: "updown",
          value: n,
        };
        this.sendSignal({ type: "metric", ...fullMetric });
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
          resource: this.resource,
          scope: this.scope,
          attributes,
          name,
          kind: "histogram",
          value,
        };
        this.sendSignal({ type: "metric", ...fullMetric });
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

  #endSpan(spanData: TelemetrySpan, parentSpanData?: TelemetrySpan) {
    try {
      // Ignore if the span is already ended
      if (spanData.endTimestamp !== -1n) return;

      // End the span
      spanData.endTimestamp = ns.now();
      spanData.duration = ns.since(spanData.startTimestamp);

      // Send span to all consumer queues
      this.sendSignal({ type: "span", ...spanData });

      // Restore parent context (if any)
      if (parentSpanData !== undefined) this.enterContextWith(parentSpanData);
      else this.enterContextWith(undefined); // using dispose() might nuke the entire context
    } catch (error) {
      this.log.error({
        message: "Error ending span",
        error,
        attributes: { span: spanData },
      });
    }
  }

  /**
   * Private helper to create a span and its associated methods.
   * Used by both trace() and traceBlock() to avoid code duplication.
   */
  #createSpan(
    params: { spanData: TelemetrySpan } | { name: string; attributes?: TelemetryAttributes },
  ): [TelemetrySpan, TelemetrySpanHandle] {
    // Use explicit parent if provided, otherwise get from context
    const parentSpanData = this.getCurrentSpanData();

    const spanData: TelemetrySpan =
      "spanData" in params
        ? params.spanData
        : {
            id: generateSpanId(),
            resource: this.resource,
            scope: this.scope,
            attributes: { ...params.attributes, ...this.globalAttributes },
            name: params.name,
            startTimestamp: ns.now(),
            endTimestamp: -1n,
            duration: -1n,
            traceId: parentSpanData?.traceId || generateTraceId(),
            parentSpanId: parentSpanData?.id,
            logs: [],
          };

    // Create getData() method
    const getData = () => deepClone(spanData);

    // Create end() method
    const end = () => this.#endSpan(spanData, parentSpanData);

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

    // Create log.{level}() methods
    const createSpanLogMethod = (level: TelemetryLog["level"]) => (input: TelemetryLogInput) => {
      if (spanData.endTimestamp !== -1n) {
        this.log.error({
          message: `Attempted to call 'log.${level}()' on already ended span. This is unexpected and must be fixed.`,
          attributes: { span: spanData, input },
        });
        return;
      }
      this.#emitLog(level, input, true);
    };
    const log: TelemetryLogHandle = {
      debug: createSpanLogMethod("debug"),
      info: createSpanLogMethod("info"),
      warn: createSpanLogMethod("warn"),
      error: createSpanLogMethod("error"),
      fatal: createSpanLogMethod("fatal"),
    };

    // Build the span handle
    const spanHandle = { end, setAttribute, setAttributes, log, getData };

    // Return the span and handle
    return [spanData, spanHandle];
  }

  /**
   * Internal log method that handles all log levels
   */
  #emitLog(level: TelemetryLog["level"], input: TelemetryLogInput, isFromSpan = false): void {
    const spanData = this.getCurrentSpanData();

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
    if (isFromSpan && spanData) spanData.logs.push(log);

    // Send to consumer queues
    this.sendSignal({ type: "log", ...log });
  }
}

export function createTelemetryClientBase<Scope extends keyof typeof telemetryScopesDefinitions>(
  ClientClass: new (s: string) => TelemetryClient,
  scope: Scope,
  requiredAttributes: z.infer<
    (typeof telemetryScopesDefinitions)[Scope]["requiredAttributesSchema"]
  > = {},
) {
  // Validate the required attributes
  const schema = telemetryScopesDefinitions[scope].requiredAttributesSchema;
  const { data, error } = schema.safeParse(requiredAttributes);
  if (error) throw new Error(`Invalid required attributes for scope '${scope}': ${error.message}`);

  // Ensure requested scope is valid
  if (!Object.keys(telemetryScopesDefinitions).includes(scope))
    throw new Error(`Invalid telemetry scope: '${scope}'.`);

  // Build the client
  const client = new ClientClass(scope);
  for (const [key, value] of Object.entries(data)) {
    client.setAttribute(key, value);
  }
  return client;
}
