import z from "zod";
import { AsyncQueue } from "@/shared/async-queue";
import { canon } from "@/shared/canon";
import { deepClone } from "@/shared/deep-clone";
import { lifeError } from "@/shared/error";
import { newId } from "@/shared/id";
import * as op from "@/shared/operation";
import { RollingBuffer } from "@/shared/rolling-buffer";
import type { Any, Todo } from "@/shared/types";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/node";
import { TransportNodeClient } from "@/transport/client/node";
import { configSchema } from "./config";
import { contextDefinition } from "./context";
import { eventInputSchema, eventsDefinition } from "./events";
import { handlersDefinition } from "./handlers";
import type {
  AgentDefinition,
  Config,
  Context,
  ContextAccessor,
  ContextListener,
  Event,
  EventSource,
  EventsAccessor,
  EventsHistory,
  EventsHistoryListener,
  EventsListener,
  EventsSelector,
  HandlerDefinition,
} from "./types";

export class AgentServer {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly definition: AgentDefinition;
  readonly #config: Config;
  readonly #isRestart: boolean;
  readonly #telemetry: TelemetryClient;
  readonly #transport: TransportNodeClient;
  readonly models = null;
  readonly storage = null;
  #context: Context;
  readonly #queue = new AsyncQueue<Event<"output">>();
  readonly #streamQueues: AsyncQueue<Event<"output">>[] = [];
  readonly #handlersStates = new Map<string, unknown>();
  readonly #eventsListeners = new Map<string, EventsListener>();
  readonly #contextListeners = new Map<string, ContextListener>();
  readonly #eventsHistory = new RollingBuffer<EventsHistory>(1000);
  readonly #eventsHistoryListeners = new Map<string, EventsHistoryListener>();

  constructor(params: {
    id: string;
    version: string;
    definition: AgentDefinition;
    isRestart: boolean;
    config?: Config;
    context?: Context;
  }) {
    this.id = params.id;
    this.name = params.definition.name;
    this.version = params.version;
    this.definition = params.definition;
    this.#isRestart = params.isRestart;

    // Validate and set config
    const { error: errConfig, data: parsedConfig } = configSchema.safeParse(params.config ?? {});
    if (errConfig)
      throw lifeError({
        code: "Validation",
        message: "Invalid config provided.",
        cause: errConfig,
      });
    this.#config = parsedConfig;

    // Validate and setcontext
    const { error: errContext, data } = contextDefinition.safeParse(params.context ?? {});
    if (errContext)
      throw lifeError({
        code: "Validation",
        message: "Invalid context provided.",
        cause: errContext,
      });
    this.#context = data;

    // Initialize telemetry
    this.#telemetry = createTelemetryClient("server", {
      agentId: this.id,
      agentName: this.name,
      agentVersion: this.version,
      agentConfig: this.#config,
      transportProviderName: this.#config.transport.provider,
      // llmProviderName: this.#config.models.llm.provider,
      // sttProviderName: this.#config.models.stt.provider,
      // eouProviderName: this.#config.models.eou.provider,
      // ttsProviderName: this.#config.models.tts.provider,
      // vadProviderName: this.#config.models.vad.provider,
    });

    // Initialize transport
    this.#transport = new TransportNodeClient({
      config: this.#config.transport,
      obfuscateErrors: true,
      telemetry: this.#telemetry,
    });

    // Expose client accessor via RPC
    this.#initClientAccessor();
  }

  async start() {
    return await this.#telemetry.trace("agent.start()", async () => {
      // 1. Initialize 'stream()' handlers sub-queues
      const streamHandlers = handlersDefinition.filter(
        (h: HandlerDefinition) => h.mode === "stream",
      );
      for (const handler of streamHandlers) {
        const queue = new AsyncQueue<Event>();
        this.#streamQueues.push(queue);
        (async () => {
          for await (const event of queue) await this.#executeHandler(handler, event);
        })();
      }

      // 2. Run the synchronous event loop with 'block' handlers and remote 'intercept' handlers
      (async () => {
        for await (const event of this.#queue) {
          try {
            // Run the 'block' handlers
            const blockHandlers = handlersDefinition.filter((h) => h.mode === "block");
            for (const handler of blockHandlers) {
              // Take a snapshot of the context data before executing the handler
              const [errOld, oldContext] = op.attempt(() => deepClone(this.#context));
              if (errOld) this.#telemetry.log.error({ error: errOld });
              // Execute the handler
              await this.#executeHandler(handler, event);
              // If the context has changed, record the change
              const [errEqual, equal] = canon.equal(this.#context, oldContext);
              if (errEqual) this.#telemetry.log.error({ error: errEqual });
              if (!equal) {
                if (!event.contextChanges) event.contextChanges = [];
                event.contextChanges.push({
                  at: Date.now(),
                  byHandler: handler.name,
                  value: { before: oldContext, after: this.#context },
                });
              }
            }

            // Feed the 'stream' handlers' queues
            for (const queue of this.#streamQueues) queue.push(event);

            // Notify events listeners
            await Promise.all(
              Array.from(this.#eventsListeners.values()).map(async ({ callback, selector }) => {
                if (this.#eventMatchesSelector(event, selector)) await callback(event);
              }),
            );
          } catch (error) {
            this.#telemetry.log.error({
              message: `Unknown error while processing event '${this.name}'.`,
              error,
            });
          }
        }
      })();

      // 3. Start the queue (send the 'plugin.start' event)
      const [errEvents, events] = this.getEventsAccessor({ type: "server" });
      if (errEvents) return op.failure(errEvents);
      const [errEmit, eventId] = events.emit({
        name: "agent.start",
        data: { isRestart: this.#isRestart },
      });
      if (errEmit) return op.failure(errEmit);
      const [errWait] = await events.wait(eventId);
      if (errWait) return op.failure(errWait);

      return op.success();
    });
  }

  async stop() {
    return await this.#telemetry.trace("agent.stop()", async () => {
      // 1. Send the 'plugin.stop' event at the front of the queue
      const [errEvents, events] = this.getEventsAccessor({ type: "server" });
      if (errEvents) return op.failure(errEvents);
      const [errEmit, eventId] = events.emit({ name: "agent.stop", urgent: true });
      if (errEmit) return op.failure(errEmit);
      const [errWait] = await events.wait(eventId);
      if (errWait) return op.failure(errWait);

      // 2. Stop the main queue and 'stream' handlers queues
      this.#queue.stop();
      for (const queue of this.#streamQueues) queue.stop();

      // 3. Clear handlers state
      this.#handlersStates.clear();

      // 4. Return that the plugin was stopped successfully
      return op.success();
    });
  }

  getConfigAccessor() {
    const [errClone, clonedConfig] = op.attempt(() => deepClone(this.#config));
    if (errClone) return op.failure(errClone);
    return op.success(clonedConfig);
  }

  getContextAccessor<Access extends "read" | "write" = "read">(
    source: EventSource<"input">,
    access: Access,
  ) {
    // Throw if trying to access 'write' if the source is a client
    if (source.type === "client" && access === "write")
      return op.failure(
        lifeError({
          code: "Validation",
          message: "Cannot access 'write' on a client source.",
        }),
      );

    // .context.onChange()
    const contextOnChange = ((selector, callback) => {
      const id = newId("listener");
      this.#contextListeners.set(id, { id, callback, selector });
      return op.success(() => this.#contextListeners.delete(id));
    }) satisfies ContextAccessor["onChange"];

    // .context.get()
    const contextGet = (() =>
      op.attempt(() => deepClone(this.#context))) satisfies ContextAccessor["get"];

    // context.set()
    const contextSet = ((valueOrUpdater) => {
      // Snapshot the old context value
      const [errOld, oldContext] = op.attempt(() => deepClone(this.#context));
      if (errOld) return op.failure(errOld);

      // Set the new context value
      if (typeof valueOrUpdater === "function") this.#context = valueOrUpdater(oldContext);
      else this.#context = valueOrUpdater;

      Promise.all([
        // Notify context change listeners
        Array.from(this.#contextListeners.values()).map(async (listener) => {
          try {
            const newSelectedValue = listener.selector(this.#context);
            const oldSelectedValue = listener.selector(oldContext);
            // Only call if value actually changed
            const [errEqual, equal] = canon.equal(newSelectedValue, oldSelectedValue);
            if (errEqual) return op.failure(errEqual);
            if (equal) await listener.callback(deepClone(this.#context), deepClone(oldContext));
          } catch (error) {
            this.#telemetry.log.error({
              message: `Error while notifying context listeners in agent '${this.id}'.`,
              error,
            });
          }
        }),
        // Send new context value updates via RPC
        this.#transport.call({
          name: `agent.${this.id}.context.changed`,
          schema: { input: z.object({ value: z.any(), timestamp: z.number() }) },
          input: { value: this.#context, timestamp: Date.now() },
        }),
      ]);

      return op.success();
    }) satisfies ContextAccessor<"write">["set"];

    return op.success({
      get: contextGet,
      set: access === "write" ? contextSet : undefined,
      onChange: contextOnChange,
    } as ContextAccessor<Access>);
  }

  getEventsAccessor(source: EventSource<"input">) {
    // events.emit()
    const eventsEmit = ((event) => {
      // Validate event shape
      const { error: errEvent, data: parsedEvent } = eventInputSchema.safeParse(event);
      if (errEvent)
        return op.failure({
          code: "Validation",
          message: "Invalid event shape for event.",
          cause: errEvent,
        });

      // Ensure the event type exists
      const eventDef = eventsDefinition.find((e) => e.name === parsedEvent.name);
      if (!eventDef)
        return op.failure({
          code: "Validation",
          message: `Event of type '${parsedEvent.name}' not found.`,
        });

      // Validate the event data
      let parsedData: unknown | null = null;
      if ("dataSchema" in eventDef && eventDef.dataSchema) {
        const { error: errData, data } = eventDef.dataSchema.safeParse(parsedEvent.data);
        parsedData = data;
        if (errData)
          return op.failure({
            code: "Validation",
            message: `Invalid event data shape for '${parsedEvent.name}' event.`,
            cause: errData,
          });
      }

      // Generate an id for the event
      const outputEvent = {
        id: newId("event"),
        name: parsedEvent.name,
        urgent: parsedEvent.urgent,
        data: parsedData,
        created: { at: Date.now(), by: source },
        contextChanges: [],
      } as Event<"output">;

      // Append to queue
      if (outputEvent.urgent) this.#queue.pushFirst(outputEvent);
      else this.#queue.push(outputEvent);

      // Return the id
      return op.success(outputEvent.id);
    }) satisfies EventsAccessor["emit"];

    // events.on()
    const eventsOn = ((selector, callback) => {
      const id = newId("listener");
      this.#eventsListeners.set(id, { id, callback, selector });
      return op.success(() => this.#eventsListeners.delete(id));
    }) satisfies EventsAccessor["on"];

    // events.once()
    const eventsOnce = ((selector, callback) => {
      const [errOn, unsubscribe] = eventsOn(selector, async (event) => {
        unsubscribe?.();
        await callback(event);
      });
      if (errOn) return op.failure(errOn);
      return op.success(unsubscribe);
    }) satisfies EventsAccessor["once"];

    // events.wait()
    const eventsWait = (async (eventId, handlerName_) => {
      const handlerName = handlerName_ ?? "all";
      try {
        const eventHistory = this.#eventsHistory.get().find((h) => h.eventId === eventId);

        if (eventHistory) {
          // Return if the event was already processed recently
          // - If waiting a specific handler
          if (handlerName) {
            const result = eventHistory.results.find((r) => r.handlerName === handlerName)?.result;
            if (result) return op.success(result);
          }
          // - If waiting for all handlers to complete
          else if (eventHistory.results.length === handlersDefinition.length) return op.success();
        }

        // Else, listen for changes to the event history until it's complete
        let resolve: (result: op.OperationResult<Any>) => void;
        const waitPromise = new Promise<op.OperationResult<Any>>((r) => {
          resolve = r;
        });
        const listenerId = newId("listener");
        this.#eventsHistoryListeners.set(listenerId, {
          eventId,
          callback: () => {
            const eventHistory_ = this.#eventsHistory.get().find((h) => h.eventId === eventId);
            // - If waiting a specific handler
            if (eventHistory_) {
              // - If waiting a specific handler
              if (handlerName) {
                const result = eventHistory_.results.find(
                  (r) => r.handlerName === handlerName,
                )?.result;
                if (result) {
                  this.#eventsHistoryListeners.delete(listenerId);
                  resolve(op.success(result));
                }
              }
              // - If waiting for all handlers to complete
              else if (eventHistory_.results.length === handlersDefinition.length) {
                this.#eventsHistoryListeners.delete(listenerId);
                resolve(op.success());
              }
            }
          },
        });

        // Wait for the event to be processed or a timeout
        const timeoutPromise = new Promise<op.OperationResult<void>>((r) => {
          setTimeout(() => {
            // Clean up the history listener
            this.#eventsHistoryListeners.delete(listenerId);
            // Resolve the promise with a timeout error
            r(
              op.failure({
                code: "Timeout",
                message: `Waiting for event '${eventId}' result timed out.`,
                isPublic: true,
              }),
            );
          }, 15_000);
        });

        return await Promise.race([waitPromise, timeoutPromise]);
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    }) satisfies EventsAccessor["wait"];

    return op.success({
      emit: eventsEmit,
      on: eventsOn,
      once: eventsOnce,
      wait: eventsWait,
    } as EventsAccessor);
  }

  continue() {
    return void 0;
  }

  decide() {
    return void 0;
  }

  interrupt() {
    return void 0;
  }

  say() {
    return void 0;
  }

  messages = {
    create: () => void 0,
    update: () => void 0,
    get: () => void 0,
    hide: () => void 0,
  };

  actions = {
    actionName: {
      execute: () => void 0,
      lastRun: null,
      setOptions: () => void 0,
    },
  };

  memories = {
    memoryName: {
      get: () => void 0,
      setOptions: () => void 0,
    },
  };

  stores = {
    storeName: {
      get: () => void 0,
      set: () => void 0,
      setOptions: () => void 0,
    },
  };

  #getHandlerState(handler: HandlerDefinition) {
    // Return the last saved state
    const savedState = this.#handlersStates.get(handler.name);
    if (savedState) return savedState;

    // If no state was set already, build and return the initial state
    const [errConfig, config] = this.getConfigAccessor();
    if (errConfig) return op.failure(errConfig);
    const initialState =
      typeof handler.state === "function" ? handler.state({ config }) : (handler.state ?? {});
    this.#handlersStates.set(handler.name, initialState);
    return initialState;
  }

  async #executeHandler(handler: (typeof handlersDefinition)[number], event: Event) {
    // Run the handler onEvent()
    const result = await (async () => {
      // Clone the event to avoid mutating the original
      const [errClone, clonedEvent] = op.attempt(() => deepClone(event));
      if (errClone) return op.failure(errClone);
      // Get the config accessor
      const [errConfig, config] = this.getConfigAccessor();
      if (errConfig) return op.failure(errConfig);
      // Get the context accessor
      const handlerAccess = handler.mode === "block" ? "write" : "read";
      const source: EventSource = { type: "server", handler: handler.name, event: event.name };
      const [errContext, context] = this.getContextAccessor(source, handlerAccess);
      if (errContext) return op.failure(errContext);
      // Get the events accessor
      const [errEvents, events] = this.getEventsAccessor(source);
      if (errEvents) return op.failure(errEvents);
      // Get the handler state
      const state = this.#getHandlerState(handler as HandlerDefinition);
      return await this.#telemetry.trace(`agent.handler.${handler.name}`, async (span) =>
        op.attempt(
          async () =>
            await handler.onEvent({
              event: clonedEvent,
              state: state as Todo,
              telemetry: span,
              config,
              events,
              context: context as Todo,
              transport: this.#transport,
              storage: this.storage,
              models: this.models,
            }),
        ),
      );
    })();

    // Log the error if any, and emit a plugin.error event
    if (result[0]) {
      this.#telemetry.log.error({
        message: `Error while executing ${handler.mode} handler '${handler.name}' in agent '${this.name}'.`,
        error: result[0],
      });
      const [errEvents, events] = this.getEventsAccessor({ type: "server" });
      if (errEvents) return op.failure(errEvents);
      const [errEmit] = events.emit({ name: "agent.error", data: { error: result[0], event } });
      if (errEmit) return op.failure(errEmit);
    }

    // Append the result to the events history
    this.#eventsHistory.add({
      eventId: event.id,
      results: [{ handlerName: handler.name, result }],
    });

    // Notify events history listeners
    for (const listener of this.#eventsHistoryListeners.values()) listener.callback(event.id);
  }

  #eventMatchesSelector(event: Event<"output">, selector: EventsSelector) {
    const isAllSelector = selector === "*";
    const isArraySelectorAndIncludesEvent =
      Array.isArray(selector) && selector.includes(event.name);
    const isObjectSelectorAndIncludesEvent =
      typeof selector === "object" &&
      "include" in selector &&
      (selector.include === "*" || selector.include.includes(event.name));
    const isObjectSelectorAndExcludesEvent =
      typeof selector === "object" &&
      "exclude" in selector &&
      selector.exclude?.includes(event.name);
    return (
      isAllSelector ||
      isArraySelectorAndIncludesEvent ||
      (isObjectSelectorAndIncludesEvent && !isObjectSelectorAndExcludesEvent)
    );
  }

  #initClientAccessor() {
    return void 0;
  }
}
