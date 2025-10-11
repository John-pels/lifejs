import z from "zod";
import type { AgentServer } from "@/agent/server/class";
import type {
  PluginConfig,
  PluginContext,
  PluginContextDefinition,
  PluginContextHandler,
  PluginDefinition,
  PluginDependencies,
  PluginEvent,
  PluginEventsDefinition,
  PluginEventsHandler,
  PluginEventsSelector,
  PluginInterceptorFunction,
  PluginMethods,
  PluginMethodsDefinition,
} from "@/plugins/server/types";
import { AsyncQueue } from "@/shared/async-queue";
import { canon, type SerializableValue } from "@/shared/canon";
import { deepClone } from "@/shared/deep-clone";
import { lifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import { newId } from "@/shared/prefixed-id";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/node";

// - Local types
type PluginExternalInterceptor = {
  server: PluginServer<PluginDefinition>;
  interceptor: PluginInterceptorFunction;
};

type PluginEventsListener<Definition extends PluginDefinition> = {
  id: string;
  // biome-ignore lint/suspicious/noExplicitAny: further type precision is not needed here
  callback: ((event: any) => void | Promise<void>) | "remote";
  selector: PluginEventsSelector<keyof Definition["events"]>;
};

type PluginContextListener<Definition extends PluginDefinition> = {
  id: string;
  selector: (context: PluginContext<Definition["context"], "output">) => unknown;
  callback: (newValue: SerializableValue, oldValue: SerializableValue) => void | Promise<void>;
};

// - Server
export class PluginServer<const Definition extends PluginDefinition> {
  readonly _definition: Definition;
  readonly #agent: AgentServer;
  readonly #config: PluginConfig<Definition["config"], "output">;
  #context: PluginContext<Definition["context"], "output">;
  readonly #eventsListeners = new Map<string, PluginEventsListener<Definition>>();
  readonly #contextListeners = new Map<string, PluginContextListener<Definition>>();
  readonly #externalInterceptors: PluginExternalInterceptor[] = [];
  readonly #queue = new AsyncQueue<PluginEvent<PluginEventsDefinition, "output">>();
  readonly #servicesQueues: AsyncQueue<PluginEvent<PluginEventsDefinition, "output">>[] = [];
  readonly #telemetry: TelemetryClient;

  constructor({
    agent,
    definition,
    config,
    context = {},
  }: {
    agent: AgentServer;
    definition: Definition;
    config: PluginConfig<Definition["config"], "input">;
    context: SerializableValue;
  }) {
    this._definition = definition;
    this.#agent = agent;

    // Validate config
    const { error: errorConfig, data: parsedConfig } = definition.config.schema.safeParse(config);
    if (errorConfig) {
      throw lifeError({
        code: "Validation",
        message: `Invalid config provided to plugin server '${definition.name}'.`,
        cause: errorConfig,
      });
    }
    this.#config = parsedConfig as PluginConfig<Definition["config"], "output">;

    // Validate context
    const { error: errorContext, data: parsedContext } = definition.context.safeParse(context);
    if (errorContext) {
      throw lifeError({
        code: "Validation",
        message: `Invalid context provided to plugin server '${definition.name}'.`,
        cause: errorContext,
      });
    }
    this.#context = parsedContext as PluginContext<Definition["context"], "output">;

    // Initialize telemetry
    this.#telemetry = createTelemetryClient("plugin.server", {
      agentId: agent.id,
      agentSha: agent.sha,
      agentName: agent.definition.name,
      agentConfig: agent.config,
      transportProviderName: agent.config.transport.provider,
      llmProviderName: agent.config.models.llm.provider,
      sttProviderName: agent.config.models.stt.provider,
      eouProviderName: agent.config.models.eou.provider,
      ttsProviderName: agent.config.models.tts.provider,
      vadProviderName: agent.config.models.vad.provider,
      pluginName: definition.name,
      pluginServerConfig: definition.config.schemaTelemetry.parse(config),
    });

    // Expose methods via RPC
    for (const [name, method] of Object.entries(this._definition.methods ?? {})) {
      const methodFn = this.#getMethods()[name];
      if (!methodFn) continue;
      this.#agent.transport.register({
        name: `plugin.${this._definition.name}.methods.${name}`,
        schema: method.schema,
        execute: methodFn,
        onError: (error) => {
          this.#telemetry.log.error({
            message: `Error while running method '${name}' in plugin '${this._definition.name}'.`,
            error,
          });
        },
      });
    }

    // Expose events.emit() via RPC
    this.#agent.transport.register({
      name: `plugin.${this._definition.name}.events.emit`,
      schema: {
        input: z.object({
          type: z.string(),
          data: z.any(),
          urgent: z.boolean().optional(),
        }),
        output: z.object({ id: z.string() }),
      },
      execute: (input) => {
        const [err, id] = this.#events.emit({
          type: input.type as keyof Definition["events"] extends string
            ? keyof Definition["events"]
            : never,
          data: input.data,
          urgent: input.urgent,
        });
        if (err) return op.failure(err);
        return op.success({ id });
      },
      onError: (error, input) => {
        this.#telemetry.log.error({
          message: `Error while emitting event '${input.type}' in plugin '${this._definition.name}'.`,
          error,
        });
      },
    });

    // Handle events subscription via RPC
    this.#agent.transport.register({
      name: `plugin.${this._definition.name}.events.subscribe`,
      schema: {
        input: z.object({
          listenerId: z.string(),
          selector: z.any(),
        }),
      },
      execute: (input) => {
        const { listenerId, selector } = input;
        this.#eventsListeners.set(listenerId, {
          id: listenerId,
          callback: "remote",
          selector,
        });
        return op.success();
      },
      onError: (error) => {
        this.#telemetry.log.error({
          message: `Error while receiving event subscription in plugin '${this._definition.name}'.`,
          error,
        });
      },
    });
    this.#agent.transport.register({
      name: `plugin.${this._definition.name}.events.unsubscribe`,
      schema: {
        input: z.object({
          listenerId: z.string(),
        }),
      },
      execute: (input) => {
        const { listenerId } = input;
        this.#eventsListeners.delete(listenerId);
        return op.success();
      },
      onError: (error) => {
        this.#telemetry.log.error({
          message: `Error while receiving event unsubscription in plugin '${this._definition.name}'.`,
          error,
        });
      },
    });

    // Handle context synchronization via RPC
    this.#agent.transport.register({
      name: `plugin.${this._definition.name}.context.get`,
      schema: { output: z.object().loose() },
      execute: () => op.success({ value: this.#context, timestamp: Date.now() }),
      onError: (error) => {
        this.#telemetry.log.error({
          message: `Error while sending context value in plugin '${this._definition.name}'.`,
          error,
        });
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
      return op.success(id);
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
      return op.success(() => {
        this.#eventsListeners.delete(id);
      });
    },
    once: (selector, callback) => {
      const unsubscribe = this.#events.on(selector, async (event) => {
        unsubscribe?.[1]?.();
        await callback(event);
      });
      return op.success(unsubscribe);
    },
  };

  // Create read-only context with onChange and get
  #createReadonlyContextHandler() {
    return {
      onChange: this.onContextChange.bind(this),
      get: this.#getContext.bind(this),
    } as PluginContextHandler<PluginContext<PluginContextDefinition, "output">, "read">;
  }

  // Create writable context for effects
  #createWritableContextHandler() {
    return {
      ...this.#createReadonlyContextHandler(),
      set: this.#setContext.bind(this),
    } as PluginContextHandler<PluginContext<PluginContextDefinition, "output">, "write">;
  }

  // Obtain a cloned snapshot of the context
  #getContext(): PluginContext<Definition["context"], "output"> {
    return op.attempt(() => deepClone(this.#context)) as PluginContext<
      Definition["context"],
      "output"
    >;
  }

  // Context setter
  #setContext(
    valueOrUpdater:
      | PluginContext<Definition["context"], "output">
      | ((
          prev: PluginContext<Definition["context"], "output">,
        ) => PluginContext<Definition["context"], "output">),
  ) {
    // Create a cloned snapshot of the current context
    const oldContext = deepClone(this.#context);

    // Obtain the new context value
    let newContext: PluginContext<Definition["context"], "output">;
    if (typeof valueOrUpdater === "function") {
      const updater = valueOrUpdater as (
        prev: PluginContext<Definition["context"], "output">,
      ) => PluginContext<Definition["context"], "output">;
      newContext = updater(deepClone(this.#context));
    } else {
      newContext = valueOrUpdater;
    }

    // Set the new context
    this.#context = deepClone(newContext) as PluginContext<Definition["context"], "output">;

    // Notify listeners
    this.#notifyContextListeners(oldContext);

    return op.success();
  }

  // Subscribe to context changes
  onContextChange(
    selector: (context: PluginContext<Definition["context"], "output">) => unknown,
    callback: (newValue: SerializableValue, oldValue: SerializableValue) => void,
  ) {
    const id = newId("listener");
    this.#contextListeners.set(id, {
      id,
      callback,
      selector,
    });

    // Return unsubscribe function
    return op.success(() => {
      this.#contextListeners.delete(id);
    });
  }

  // Notify all listeners
  async #notifyContextListeners(oldContextValue: PluginContext<Definition["context"], "output">) {
    await Promise.all([
      Array.from(this.#contextListeners.values()).map(async (listener) => {
        try {
          const newSelectedValue = listener.selector(this.#context) as SerializableValue;
          const oldSelectedValue = listener.selector(oldContextValue) as SerializableValue;
          // Only call if value actually changed
          if (!canon.equal(newSelectedValue, oldSelectedValue)) {
            await listener.callback(newSelectedValue, oldSelectedValue);
          }
        } catch (error) {
          this.#telemetry.log.error({
            message: `Error while notifying context listeners in plugin '${this._definition.name}'.`,
            error,
          });
        }
      }),
      // Send new context value via RPC
      this.#agent.transport
        .call({
          name: `plugin.${this._definition.name}.context.changed`,
          input: { value: this.#context, timestamp: Date.now() },
          inputSchema: {
            input: z.object({ value: z.any(), timestamp: z.number() }),
          },
        })
        .then((result) => {
          const [err] = result;
          if (err) {
            this.#telemetry.log.error({
              message: `Error while sending context value in plugin '${this._definition.name}'.`,
              error: err,
            });
          }
        })
        .catch((error) => {
          this.#telemetry.log.error({
            message: `Error while sending context value in plugin '${this._definition.name}'.`,
            error,
          });
        }),
    ]);
  }

  #getMethods() {
    const methods: Record<string, (input: unknown) => unknown> = {};

    for (const [name, method] of Object.entries(this._definition.methods ?? {})) {
      // Create a function that validates inputs and calls the run function
      methods[name] = async (input: unknown) => {
        return await this.#telemetry.trace(
          `plugin.${this._definition.name}.methods.${name}()`,
          async (span) => {
            try {
              // Validate input using the schema
              const validationResult = method.schema.input.safeParse(input);
              if (!validationResult.success) {
                return op.failure({
                  code: "Validation",
                  message: `Invalid input for method ${name}.`,
                  cause: validationResult.error,
                });
              }

              // Call the run function with plugin context and validated input
              const result = await method.run(
                {
                  config: this.#config,
                  context: op.toPublic(this.#createWritableContextHandler()),
                  events: op.toPublic(this.#events as PluginEventsHandler<PluginEventsDefinition>),
                  telemetry: span,
                },
                validationResult.data,
              );

              // Unwrap error and data if the result is an operation result
              const data = op.isResult(result) ? result[1] : result;
              const error = op.isResult(result) ? result[0] : null;
              if (error) return op.failure(error);

              // Validate output using the schema
              const outputValidation = method.schema.output.safeParse(data);
              if (!outputValidation.success) {
                return op.failure({
                  code: "Validation",
                  message: `Invalid output from method ${name}.`,
                  cause: outputValidation.error,
                });
              }

              return op.success(outputValidation.data);
            } catch (error) {
              return op.failure({ code: "Unknown", cause: error });
            }
          },
        );
      };
    }

    return methods as PluginMethods<PluginMethodsDefinition>;
  }

  // Helper method to call onError lifecycle hook
  async #callOnErrorHook(error: unknown): Promise<void> {
    await this.#telemetry.trace(
      `plugin.${this._definition.name}.lifecycle.onError()`,
      async (span) => {
        if (this._definition.lifecycle?.onError) {
          try {
            await this._definition.lifecycle.onError({
              config: this.#config,
              context: op.toPublic(this.#createWritableContextHandler()),
              events: op.toPublic(this.#events as PluginEventsHandler<PluginEventsDefinition>),
              methods: op.toPublic(this.#getMethods()),
              error,
              telemetry: span,
            });
          } catch (errorHandlerError) {
            span.log.error({
              message: `Error while running onError() lifecycle hook for plugin '${this._definition.name}'.`,
              error: errorHandlerError,
              attributes: { plugin: this._definition.name },
            });
          }
        }
      },
    );
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

      this.#telemetry.trace(
        `plugin.${this._definition.name}.services.${service.name}()`,
        (span) => {
          service({
            agent: op.toPublic(this.#agent),
            queue: queue[Symbol.asyncIterator](),
            config: this.#config,
            context: op.toPublic(readonlyContext),
            events: op.toPublic(this.#events as PluginEventsHandler<PluginEventsDefinition>),
            methods: op.toPublic(this.#getMethods()),
            dependencies,
            telemetry: span,
          });
        },
      );
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
    await this.#telemetry.trace(
      `plugin.${this._definition.name}.lifecycle.onStart()`,
      async (span) => {
        if (this._definition.lifecycle?.onStart) {
          try {
            await this._definition.lifecycle.onStart({
              config: this.#config,
              context: op.toPublic(this.#createWritableContextHandler()),
              events: op.toPublic(this.#events as PluginEventsHandler<PluginEventsDefinition>),
              methods: op.toPublic(this.#getMethods()),
              telemetry: span,
            });
          } catch (error) {
            span.log.error({
              message: `Error while running onStart() lifecycle hook for plugin '${this._definition.name}'.`,
              error,
              attributes: { plugin: this._definition.name },
            });
            await this.#callOnErrorHook(error);
          }
        }
      },
    );

    // Call onRestart lifecycle hook
    await this.#telemetry.trace(
      `plugin.${this._definition.name}.lifecycle.onRestart()`,
      async (span) => {
        if (this.#agent.isRestart && this._definition.lifecycle?.onRestart) {
          try {
            await this._definition.lifecycle.onRestart({
              config: this.#config,
              context: op.toPublic(this.#createWritableContextHandler()),
              events: op.toPublic(this.#events as PluginEventsHandler<PluginEventsDefinition>),
              methods: op.toPublic(this.#getMethods()),
              telemetry: span,
            });
          } catch (error) {
            span.log.error({
              message: `Error while running onRestart() lifecycle hook for plugin '${this._definition.name}'.`,
              error,
              attributes: { plugin: this._definition.name },
            });
            await this.#callOnErrorHook(error);
          }
        }
      },
    );

    // Start the queue
    (async () => {
      for await (let event of this.#queue) {
        try {
          // 1. Run external interceptors
          let isDropped = false;
          for (const { interceptor, server } of this.#externalInterceptors) {
            // biome-ignore lint/performance/noAwaitInLoops: sequential execution required here
            await server.#telemetry.trace(
              `plugin.${this._definition.name}.interceptors.${interceptor.name}()`,
              async (span) => {
                const drop = (_reason: string) => (isDropped = true);
                const next = (newEvent: PluginEvent<PluginEventsDefinition, "output">) => {
                  event = newEvent;
                };

                await interceptor({
                  event,
                  next,
                  drop,
                  dependency: {
                    name: this._definition.name,
                    definition: this._definition,
                    config: this.#config,
                    context: op.toPublic(this.#createReadonlyContextHandler()),
                    events: op.toPublic(
                      this.#events as PluginEventsHandler<PluginEventsDefinition>,
                    ),
                    methods: op.toPublic(this.#getMethods()),
                  },
                  current: {
                    events: op.toPublic(
                      server.#events as PluginEventsHandler<typeof server._definition.events>,
                    ),
                    context: op.toPublic(server.#createReadonlyContextHandler()),
                    config: server.#config,
                  },
                  telemetry: span,
                });
              },
            );
            if (isDropped) break;
          }
          if (isDropped) continue;

          // 2. Run effects
          const dependencies = this.#buildDependencies();
          for (const effect of Object.values(this._definition.effects ?? {})) {
            // biome-ignore lint/performance/noAwaitInLoops: sequential execution expected here
            await this.#telemetry.trace(
              `plugin.${this._definition.name}.effects.${effect.name}()`,
              async (span) => {
                await effect({
                  agent: op.toPublic(this.#agent),
                  event: deepClone(event),
                  config: this.#config,
                  context: op.toPublic(this.#createWritableContextHandler()),
                  events: op.toPublic(this.#events as PluginEventsHandler<PluginEventsDefinition>),
                  dependencies,
                  methods: op.toPublic(this.#getMethods()),
                  telemetry: span,
                });
              },
            );
          }

          // 3. Feed services' queues
          for (const queue of this.#servicesQueues) {
            queue.push(deepClone(event));
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
                  const [err] = await this.#agent.transport.call({
                    name: `plugin.${this._definition.name}.events.callback`,
                    input: { listenerId: id, event },
                    inputSchema: {
                      input: z.object({ listenerId: z.string(), event: z.any() }),
                    },
                  });
                  if (err) {
                    this.#telemetry.log.error({
                      message: `Error while steaming event to remote listener in plugin '${this._definition.name}'.`,
                      error: err,
                    });
                  }
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
    })();

    return op.success();
  }

  async stop() {
    // Call onStop lifecycle hook
    await this.#telemetry.trace(
      `plugin.${this._definition.name}.lifecycle.onStop()`,
      async (span) => {
        if (this._definition.lifecycle?.onStop) {
          try {
            await this._definition.lifecycle.onStop({
              config: this.#config,
              context: op.toPublic(this.#createWritableContextHandler()),
              events: op.toPublic(this.#events as PluginEventsHandler<PluginEventsDefinition>),
              methods: op.toPublic(this.#getMethods()),
              telemetry: span,
            });
          } catch (error) {
            span.log.error({
              message: `Error while running onStop() lifecycle hook for plugin '${this._definition.name}'.`,
              error,
              attributes: { plugin: this._definition.name },
            });
            await this.#callOnErrorHook(error);
          }
        }
      },
    );
  }
}
