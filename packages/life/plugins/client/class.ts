import z from "zod";
import type { AgentClient } from "@/agent/client/class";
import type { AgentClientDefinition } from "@/agent/client/types";
import { canon, type SerializableValue } from "@/shared/canon";
import { deepClone } from "@/shared/deep-clone";
import { lifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import { newId } from "@/shared/prefixed-id";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/browser";
import type { PluginContext } from "../server/types";
import type {
  PluginClientAtoms,
  PluginClientConfig,
  PluginClientContextHandler,
  PluginClientDefinition,
  PluginClientDependencies,
  PluginClientEventsHandler,
  PluginClientMethods,
  PluginClientServer,
} from "./types";

export class PluginClientBase<ClientDefinition extends PluginClientDefinition> {
  readonly _isPluginClient = true;
  readonly _definition: ClientDefinition;
  readonly config: PluginClientConfig<ClientDefinition["config"], "output">;
  readonly atoms: PluginClientAtoms<ClientDefinition["atoms"]>;
  readonly server: PluginClientServer<ClientDefinition["$serverDef"]>;
  readonly #agent: AgentClient<AgentClientDefinition>;
  readonly #telemetry: TelemetryClient;

  get #dependencies() {
    const dependencies = {} as PluginClientDependencies<ClientDefinition["dependencies"]>;
    for (const [depName] of Object.entries(this._definition.dependencies ?? {})) {
      // @ts-expect-error - this.agent is an agent client and has a plugins properties
      dependencies[depName as keyof typeof dependencies] = this.#agent[depName];
    }
    return dependencies;
  }

  readonly #eventsListeners = new Map<
    string,
    // biome-ignore lint/suspicious/noExplicitAny: further type precision is not needed here and would just make code more complex
    { id: string; callback: (event: any) => void | Promise<void> }
  >();
  #contextValue = {} as PluginContext<ClientDefinition["$serverDef"]["context"], "output">;
  #lastContextValueTimestamp = 0;
  readonly #contextListeners = new Map<
    string,
    {
      id: string;
      selector: (
        context: PluginContext<ClientDefinition["$serverDef"]["context"], "output">,
      ) => unknown;
      callback: (
        newContext: PluginContext<ClientDefinition["$serverDef"]["context"], "output">,
        oldContext: PluginContext<ClientDefinition["$serverDef"]["context"], "output">,
      ) => void | Promise<void>;
    }
  >();

  constructor(
    definition: ClientDefinition,
    config: PluginClientConfig<ClientDefinition["config"], "input">,
    agent: AgentClient<AgentClientDefinition>,
  ) {
    this._definition = definition;
    this.#agent = agent;

    // Validate config
    const { data, error: errConfig } = definition.config.schema.safeParse(config);
    if (errConfig) {
      throw lifeError({
        code: "Validation",
        message: `Invalid config provided to plugin client '${definition.name}'.`,
        cause: errConfig,
      });
    }
    this.config = data as PluginClientConfig<ClientDefinition["config"], "output">;

    // Initialize telemetry
    this.#telemetry = createTelemetryClient("plugin.client", {
      agentId: agent.id,
      agentName: agent._definition.name,
      agentConfig: agent.config,
      transportProviderName: agent.config.transport.provider,
      pluginName: definition.name,
      pluginClientConfig: this.config,
    });

    // Build the server interface
    const server = {
      methods: {} as PluginClientMethods<ClientDefinition["$serverDef"]["methods"]>,
      context: {} as PluginClientContextHandler<
        PluginContext<ClientDefinition["$serverDef"]["context"], "output">
      >,
      events: {} as PluginClientEventsHandler<ClientDefinition["$serverDef"]["events"]>,
    };

    // Wire methods with proxy
    server.methods = new Proxy(
      {},
      {
        get: (_, method: string) => (input: unknown) =>
          agent.transport.call({
            name: `plugin.${this._definition.name}.methods.${method}`,
            input: input as SerializableValue,
          }),
      },
    ) as typeof server.methods;

    // Wire events
    server.events.emit = (input: unknown) =>
      agent.transport.call({
        name: `plugin.${this._definition.name}.events.emit`,
        input: input as SerializableValue,
      }) as Promise<op.OperationResult<string>>;
    agent.transport.register({
      name: `plugin.${this._definition.name}.events.callback`,
      schema: {
        input: z.object({
          listenerId: z.string(),
          event: z.object({ type: z.string(), id: z.string(), data: z.any() }),
        }),
      },
      execute: async ({ listenerId, event }) => {
        await this.#eventsListeners.get(listenerId)?.callback(event);
        return op.success();
      },
      onError: (error, input) => {
        this.#telemetry.log.error({
          message: `Error while receiving event callback for event '${input.event?.type}' in plugin '${this._definition.name}'.`,
          error,
        });
      },
    });
    server.events.on = (...args: unknown[]) => {
      const [selector, callback] = args as Parameters<typeof server.events.on>;

      // Generate new listener id
      const id = newId("listener");

      // Register callback
      this.#eventsListeners.set(id, { id, callback });

      // Ask plugin's server to stream selected event
      agent.transport
        .call({
          name: `plugin.${this._definition.name}.events.subscribe`,
          input: { listenerId: id, selector },
          inputSchema: {
            input: z.object({ listenerId: z.string(), selector: z.any() }),
          },
        })
        .then((result) => {
          const [err] = result;
          if (err) {
            this.#telemetry.log.error({
              message: `Error while subscribing to events in plugin '${this._definition.name}'.`,
              error: err,
            });
          }
        })
        .catch((error) => {
          this.#telemetry.log.error({
            message: `Error while subscribing to events in plugin '${this._definition.name}'.`,
            error,
          });
        });

      // Return unsubscribe function
      return op.success(() => {
        // Stop subscription server-side
        agent.transport
          .call({
            name: `plugin.${this._definition.name}.events.unsubscribe`,
            input: { listenerId: id },
            inputSchema: {
              input: z.object({ listenerId: z.string() }),
            },
          })
          .then((result) => {
            const [err] = result;
            if (err) {
              this.#telemetry.log.error({
                message: `Error while unsubscribing from events in plugin '${this._definition.name}'.`,
                error: err,
              });
            }
          })
          .catch((error) => {
            this.#telemetry.log.error({
              message: `Error while unsubscribing from events in plugin '${this._definition.name}'.`,
              error,
            });
          });

        // Clean up callback
        this.#eventsListeners.delete(id);
      });
    };
    server.events.once = (...args: unknown[]) => {
      const [selector, callback] = args as Parameters<typeof server.events.once>;
      const unsubscribe = server.events.on(selector, async (event) => {
        unsubscribe?.[1]?.();
        await callback(event);
      });
      return unsubscribe;
    };

    // Wire context
    server.context.onChange = (...args: unknown[]) => {
      const [selector, callback] = args as Parameters<typeof server.context.onChange>;

      // Generate new listener id
      const listenerId = newId("listener");

      // Register callback
      this.#contextListeners.set(listenerId, {
        id: listenerId,
        callback,
        selector,
      });

      // Return unsubscribe function
      return op.success(() => this.#contextListeners.delete(listenerId));
    };
    server.context.get = () =>
      op.attempt(
        () =>
          deepClone(this.#contextValue) as op.OperationResult<
            PluginContext<ClientDefinition["$serverDef"]["context"], "output">
          >,
      );
    this.#agent.transport.register({
      name: `plugin.${this._definition.name}.context.changed`,
      schema: {
        input: z.object({ value: z.any(), timestamp: z.number() }),
      },
      execute: async ({ value, timestamp }) => await this.#setContextValue(value, timestamp),
      onError: (error) => {
        this.#telemetry.log.error({
          message: `Error while receiving context change value in plugin '${this._definition.name}'.`,
          error,
        });
      },
    });

    // Assign the server
    this.server = op.toPublic(server) as unknown as PluginClientServer<
      ClientDefinition["$serverDef"]
    >;

    // Build atoms
    this.atoms = definition.atoms({
      config: this.config,
      server: {
        methods: this.server.methods as never,
        context: this.server.context as never,
        events: this.server.events as never,
      },
      dependencies: this.#dependencies,
    }) as PluginClientAtoms<ClientDefinition["atoms"]>;
  }

  async #setContextValue(
    value: PluginContext<ClientDefinition["$serverDef"]["context"], "output">,
    timestamp: number,
  ) {
    // Clone the old context value
    const oldContextValue = deepClone(this.#contextValue);

    // Ensure the new value is newer than the last one
    if (timestamp > this.#lastContextValueTimestamp) {
      this.#lastContextValueTimestamp = timestamp;
      this.#contextValue = value;
    } else return op.success();

    // Notify listeners if the value they select has changed
    await Promise.all(
      Array.from(this.#contextListeners.values()).map(async (listener) => {
        const newSelectedValue = listener.selector(this.#contextValue) as SerializableValue;
        const oldSelectedValue = listener.selector(oldContextValue) as SerializableValue;

        // Check if the value actually changed
        const [errEqual, equal] = canon.equal(newSelectedValue, oldSelectedValue);
        if (errEqual) return op.failure({ code: "Unknown", cause: errEqual });
        else if (equal) return op.success();

        // Call the listener if changed
        return await op.attempt(
          async () =>
            await listener.callback(deepClone(this.#contextValue), deepClone(oldContextValue)),
        );
      }),
    );
    return op.success();
  }

  async refreshContext() {
    try {
      return await this.#agent.transport
        .call({
          name: `plugin.${this._definition.name}.context.get`,
        })
        .then(async (result) => {
          const [errorCall, response] = result;
          if (errorCall) return op.failure({ code: "Unknown", cause: errorCall });

          // Validate output
          const { data: output, error: outputError } = z
            .object({ value: z.any(), timestamp: z.number() })
            .safeParse(response);
          if (outputError) return op.failure({ code: "Unknown", cause: outputError });

          // Initialize context
          return await this.#setContextValue(output.value, output.timestamp);
        });
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }
}
