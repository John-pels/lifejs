import z from "zod";
import type { AgentServer } from "@/agent/server/class";
import type {
  PluginConfig,
  PluginContext,
  PluginContextHandler,
  PluginDefinition,
  PluginDependencies,
  PluginEvent,
  PluginEventsDefinition,
  PluginEventsHandler,
  PluginEventsSelector,
  PluginInterceptorFunction,
} from "@/plugins/server/types";
import { AsyncQueue } from "@/shared/async-queue";
import { canon, type SerializableValue } from "@/shared/canon";
import { klona } from "@/shared/klona";
import { newId } from "@/shared/prefixed-id";
import { lifeTelemetry } from "@/telemetry/client";
import type { TelemetryClient } from "@/telemetry/types";

type PluginExternalInterceptor = {
  server: PluginServer<PluginDefinition>;
  interceptor: PluginInterceptorFunction;
};

// - Server
export class PluginServer<const Definition extends PluginDefinition> {
  readonly _definition: Definition;
  readonly #agent: AgentServer;
  readonly #config: PluginConfig<Definition["config"], "output">;
  readonly #eventsListeners = new Map<
    string,
    {
      id: string;
      // biome-ignore lint/suspicious/noExplicitAny: further type precision is not needed here and would just make code more complex
      callback: ((event: any) => void | Promise<void>) | "remote";
      selector: PluginEventsSelector<keyof Definition["events"]>;
    }
  >();
  readonly #contextValue: PluginContext<Definition["context"], "output">;
  readonly #contextListeners = new Map<
    string,
    {
      id: string;
      selector: (context: PluginContext<Definition["context"], "output">) => SerializableValue;
      callback: (newValue: SerializableValue, oldValue: SerializableValue) => void | Promise<void>;
    }
  >();
  readonly #externalInterceptors: PluginExternalInterceptor[] = [];
  readonly #queue: AsyncQueue<PluginEvent<PluginEventsDefinition, "output">> = new AsyncQueue<
    PluginEvent<PluginEventsDefinition, "output">
  >();
  readonly #servicesQueues: AsyncQueue<PluginEvent<PluginEventsDefinition, "output">>[] = [];
  readonly #telemetry: TelemetryClient;

  constructor(
    agent: AgentServer,
    definition: Definition,
    config: PluginConfig<Definition["config"], "output">,
  ) {
    this._definition = definition;
    this.#agent = agent;
    this.#config = config;
    this.#contextValue = definition.context.parse({});
    this.#telemetry = lifeTelemetry.child(`plugin-${definition.name}`);

    // Expose methods via RPC
    for (const [name, method] of Object.entries(this._definition.methods ?? {})) {
      this.#agent.transport.register({
        name: `plugin.${this._definition.name}.methods.${name}`,
        schema: method.schema,
        execute: this.#getMethods()[name] as (...args: unknown[]) => unknown,
      });
    }

    // Expose events.emit() via RPC
    this.#agent.transport.register({
      name: `plugin.${this._definition.name}.events.emit`,
      schema: z
        .function()
        .args(
          z.object({
            type: z.string(),
            data: z.any(),
            urgent: z.boolean().optional(),
          }),
        )
        .returns(z.string()),
      execute: this.#events.emit as (...args: unknown[]) => string,
    });

    // Handle events subscription via RPC
    this.#agent.transport.register({
      name: `plugin.${this._definition.name}.events.subscribe`,
      schema: z
        .function()
        .args(
          z.object({
            listenerId: z.string(),
            selector: z.any(),
          }),
        )
        .returns(z.void()),
      execute: (args) => {
        const { listenerId, selector } = args;
        this.#eventsListeners.set(listenerId, {
          id: listenerId,
          callback: "remote",
          selector,
        });
      },
    });
    this.#agent.transport.register({
      name: `plugin.${this._definition.name}.events.unsubscribe`,
      schema: z
        .function()
        .args(
          z.object({
            listenerId: z.string(),
          }),
        )
        .returns(z.void()),
      execute: (args) => {
        const { listenerId } = args;
        this.#eventsListeners.delete(listenerId);
      },
    });

    // Handle context synchronization via RPC
    this.#agent.transport.register({
      name: `plugin.${this._definition.name}.context.get`,
      schema: z.function().returns(z.any()),
      execute: () => {
        return this.#contextValue;
      },
    });
  }

  readonly #events: PluginEventsHandler<Definition["events"]> = {
    emit: (event) => {
      // Ensure the event type exists
      const eventDefinition = this._definition?.events?.[event.type];
      if (!eventDefinition) throw new Error(`Event of type '${event.type}' not found.`);

      // Validate the event data
      if ("data" in event && eventDefinition.dataSchema) {
        const validation = eventDefinition.dataSchema?.safeParse(event.data);
        if (!validation.success)
          throw new Error(`Event '${event.type}' data is invalid: ${validation.error.message}.`);
      } else if ("data" in event) {
        throw new Error(`Event '${event.type}' provided unexpected data.`);
      }

      // Generate an id for the event
      const id = newId("event");
      const outputEvent = { id, ...event };

      // Append to queue
      if (event.urgent) this.#queue.pushFirst(outputEvent);
      else this.#queue.push(outputEvent);

      // Return the id
      return id;
    },
    on: (selector, callback) => {
      // Generate new listener id
      const id = newId("listener");

      // Register callback
      this.#eventsListeners.set(id, {
        id,
        callback,
        selector,
      });

      // Return unsubscribe function
      return () => {
        this.#eventsListeners.delete(id);
      };
    },
    once: (selector, callback) => {
      const unsubscribe = this.#events.on(selector, async (event) => {
        unsubscribe();
        await callback(event);
      });
      return unsubscribe;
    },
  };

  // Create read-only context with onChange and get
  #createReadonlyContextHandler() {
    return {
      onChange: this.#onContextChange.bind(this),
      get: this.#getContext.bind(this),
    } as PluginContextHandler<PluginContext<Definition["context"], "output">, "read">;
  }

  // Create writable context for effects
  #createWritableContextHandler(): PluginContextHandler<
    PluginContext<Definition["context"], "output">,
    "write"
  > {
    return {
      ...this.#createReadonlyContextHandler(),
      set: this.#setContext.bind(this),
    };
  }

  // Obtain a cloned snapshot of the context
  #getContext(): PluginContext<Definition["context"], "output"> {
    return klona(this.#contextValue);
  }

  // Context setter
  #setContext<K extends keyof PluginContext<Definition["context"], "output">>(
    key: K,
    valueOrUpdater:
      | PluginContext<Definition["context"], "output">[K]
      | ((
          prev: PluginContext<Definition["context"], "output">[K],
        ) => PluginContext<Definition["context"], "output">[K]),
  ): void {
    // Create a cloned snapshot of the current value and context
    const oldContext = klona(this.#contextValue);
    const currentKeyValue = klona(this.#contextValue[key]);

    // Obtain the new value
    let newKeyValue: PluginContext<Definition["context"], "output">[K];
    if (typeof valueOrUpdater === "function") {
      const updater = valueOrUpdater as (
        prev: PluginContext<Definition["context"], "output">[K],
      ) => PluginContext<Definition["context"], "output">[K];
      newKeyValue = updater(currentKeyValue);
    } else {
      newKeyValue = valueOrUpdater;
    }

    // Set the new value
    this.#contextValue[key] = klona(newKeyValue);

    // Notify listeners
    this.#notifyContextListeners(oldContext);
  }

  // Subscribe to context changes
  #onContextChange(
    selector: (context: PluginContext<Definition["context"], "output">) => SerializableValue,
    callback: (newValue: SerializableValue, oldValue: SerializableValue) => void,
  ): () => void {
    const id = newId("listener");
    this.#contextListeners.set(id, {
      id,
      callback,
      selector,
    });

    // Return unsubscribe function
    return () => {
      this.#contextListeners.delete(id);
    };
  }

  // Notify all listeners
  async #notifyContextListeners(oldContextValue: PluginContext<Definition["context"], "output">) {
    await Promise.all([
      Array.from(this.#contextListeners.values()).map(async (listener) => {
        const newSelectedValue = listener.selector(this.#contextValue);
        const oldSelectedValue = listener.selector(oldContextValue);
        // Only call if value actually changed
        if (!canon.equal(newSelectedValue, oldSelectedValue)) {
          await listener.callback(newSelectedValue, oldSelectedValue);
        }
      }),
      // Send new context value via RPC
      this.#agent.transport.call({
        name: `plugin.${this._definition.name}.context.changed`,
        args: { value: this.#contextValue, timestamp: Date.now() },
      }),
    ]);
  }

  #getMethods() {
    const methods: Record<string, (input: unknown) => unknown> = {};

    for (const [name, method] of Object.entries(this._definition.methods ?? {})) {
      // Create a function that validates inputs and calls the run function
      methods[name] = (input: unknown) => {
        // Validate input using the schema
        const validationResult = method.schema.input.safeParse(input);
        if (!validationResult.success) {
          throw new Error(
            `Invalid input for method ${name}: ${validationResult.error.message}`,
          );
        }

        // Call the run function with plugin context and validated input
        const result = method.run(
          {
            config: this.#config,
            context: this.#createWritableContextHandler(),
            events: this.#events as PluginEventsHandler<Definition["events"]>,
            telemetry: this.#telemetry,
          },
          validationResult.data,
        );

        // Validate output using the schema
        const outputValidation = method.schema.output.safeParse(result);
        if (!outputValidation.success) {
          throw new Error(
            `Invalid output from method ${name}: ${outputValidation.error.message}`,
          );
        }

        return outputValidation.data;
      };
    }

    return methods;
  }

  // Helper method to call onError lifecycle hook
  async #callOnErrorHook(error: unknown): Promise<void> {
    if (this._definition.lifecycle?.onError) {
      try {
        await this._definition.lifecycle.onError({
          config: this.#config,
          context: this.#createWritableContextHandler(),
          events: this.#events as PluginEventsHandler<Definition["events"]>,
          methods: this.#getMethods(),
          error,
          telemetry: this.#telemetry,
        });
      } catch (errorHandlerError) {
        this.#telemetry.log.error({
          message: `Error while running onError() lifecycle hook for plugin '${this._definition.name}'.`,
          error: errorHandlerError,
          attributes: { plugin: this._definition.name },
        });
      }
    }
  }

  #buildDependencies() {
    const dependencies: Record<string, unknown> = {};

    for (const [depName] of Object.entries(this._definition.dependencies ?? {})) {
      const depServer = this.#agent.plugins[depName];
      if (!depServer) continue;

      dependencies[depName] = {
        config: depServer.#config,
        context: depServer.#createReadonlyContextHandler(),
        events: depServer.#events,
        methods: depServer.#getMethods(),
      };
    }

    return dependencies as PluginDependencies<Definition["dependencies"]>;
  }

  // ------------------

  registerExternalInterceptor(interceptor: PluginExternalInterceptor) {
    this.#externalInterceptors.push(interceptor);
  }

  init() {
    // 1. Initialize services
    const dependencies = this.#buildDependencies();

    for (const service of Object.values(this._definition.services ?? {}) ?? []) {
      const queue = new AsyncQueue<PluginEvent<PluginEventsDefinition, "output">>();
      this.#servicesQueues.push(queue);

      // Create a single readonly context that always returns fresh values
      const readonlyContext = this.#createReadonlyContextHandler();

      service({
        agent: this.#agent,
        queue: queue[Symbol.asyncIterator](),
        config: this.#config,
        context: readonlyContext,
        events: this.#events as PluginEventsHandler<Definition["events"]>,
        dependencies,
        methods: this.#getMethods(),
        telemetry: this.#telemetry,
      });
    }

    // 2. Register interceptors with dependencies
    for (const interceptor of Object.values(this._definition.interceptors ?? {})) {
      // Register this interceptor with each dependency it intercepts
      for (const depName of Object.keys(this._definition.dependencies ?? {})) {
        const dependentServer = this.#agent.plugins[depName];
        if (dependentServer) {
          dependentServer.registerExternalInterceptor({
            server: this as unknown as PluginServer<PluginDefinition>,
            interceptor,
          });
        }
      }
    }
  }

  async start() {
    // Call onStart lifecycle hook
    if (this._definition.lifecycle?.onStart) {
      try {
        await this._definition.lifecycle.onStart({
          config: this.#config,
          context: this.#createWritableContextHandler(),
          events: this.#events as PluginEventsHandler<Definition["events"]>,
          methods: this.#getMethods(),
          telemetry: this.#telemetry,
        });
      } catch (error) {
        this.#telemetry.log.error({
          message: `Error while running onStart() lifecycle hook for plugin '${this._definition.name}'.`,
          error,
          attributes: { plugin: this._definition.name },
        });
        await this.#callOnErrorHook(error);
      }
    }

    // Start the queue
    for await (let event of this.#queue) {
      try {
        // 1. Run external interceptors
        let isDropped = false;
        for (const { interceptor, server } of this.#externalInterceptors) {
          const drop = (_reason: string) => (isDropped = true);
          const next = (newEvent: PluginEvent<PluginEventsDefinition, "output">) => {
            event = newEvent;
          };

          // biome-ignore lint/performance/noAwaitInLoops: sequential execution required here
          await interceptor({
            event,
            next,
            drop,
            dependency: {
              name: this._definition.name,
              definition: this._definition,
              config: this.#config,
              context: this.#createReadonlyContextHandler(),
              events: this.#events as PluginEventsHandler<Definition["events"]>,
              methods: this.#getMethods(),
            },
            current: {
              events: server.#events as PluginEventsHandler<typeof server._definition.events>,
              context: server.#createReadonlyContextHandler(),
              config: server.#config,
            },
            telemetry: server.#telemetry,
          });
          if (isDropped) break;
        }
        if (isDropped) continue;

        // 2. Run effects
        const dependencies = this.#buildDependencies();
        for (const effect of Object.values(this._definition.effects ?? {})) {
          // biome-ignore lint/performance/noAwaitInLoops: sequential execution expected here
          await effect({
            agent: this.#agent,
            event: klona(event),
            config: this.#config,
            context: this.#createWritableContextHandler(),
            events: this.#events as PluginEventsHandler<Definition["events"]>,
            dependencies,
            methods: this.#getMethods(),
            telemetry: this.#telemetry,
          });
        }

        // 3. Feed services' queues
        for (const queue of this.#servicesQueues) {
          queue.push(klona(event));
        }

        // 4. Notify events listeners
        await Promise.all(
          Array.from(this.#eventsListeners.values()).map(async ({ id, callback, selector }) => {
            const isAllSelector = selector === "*";
            const isArraySelectorAndIncludesEvent =
              Array.isArray(selector) && selector.includes(event.type);
            const isObjectSelectorAndIncludesEvent =
              typeof selector === "object" &&
              "include" in selector &&
              (selector.include === "*" || selector.include.includes(event.type));
            const isObjectSelectorAndExcludesEvent =
              typeof selector === "object" &&
              "exclude" in selector &&
              selector.exclude?.includes(event.type);

            if (
              isAllSelector ||
              isArraySelectorAndIncludesEvent ||
              (isObjectSelectorAndIncludesEvent && !isObjectSelectorAndExcludesEvent)
            ) {
              // If this is a remote callback, stream the event to the remote callback
              if (callback === "remote") {
                await this.#agent.transport.call({
                  name: `plugin.${this._definition.name}.events.callback`,
                  args: { listenerId: id, event },
                });
              }

              // Else, call the local callback
              else await callback(event);
            }
          }),
        );
      } catch (error) {
        this.#telemetry.log.error({
          message: `Error processing event in plugin '${this._definition.name}'.`,
          error,
          attributes: { plugin: this._definition.name },
        });
        await this.#callOnErrorHook(error);
      }
    }
  }

  async stop() {
    // Call onStop lifecycle hook
    if (this._definition.lifecycle?.onStop) {
      try {
        await this._definition.lifecycle.onStop({
          config: this.#config,
          context: this.#createWritableContextHandler(),
          events: this.#events as PluginEventsHandler<Definition["events"]>,
          methods: this.#getMethods(),
          telemetry: this.#telemetry,
        });
      } catch (error) {
        this.#telemetry.log.error({
          message: `Error while running onStop() lifecycle hook for plugin '${this._definition.name}'.`,
          error,
          attributes: { plugin: this._definition.name },
        });
        await this.#callOnErrorHook(error);
      }
    }
  }
}
