import z from "zod";
import type { AgentClient } from "@/agent/client/class";
import type { AgentClientDefinition } from "@/agent/client/types";
import { canon, type SerializableValue } from "@/shared/canon";
import { deepClone } from "@/shared/deep-clone";
import * as op from "@/shared/operation";
import { newId } from "@/shared/prefixed-id";
import type { PluginContext } from "../server/types";
import type {
  PluginClientAtoms,
  PluginClientConfig,
  PluginClientDefinition,
  PluginClientDependencies,
  PluginClientServer,
} from "./types";

export class PluginClientBase<ClientDefinition extends PluginClientDefinition> {
  readonly _isPluginClient = true;
  readonly _definition: ClientDefinition;
  readonly config: PluginClientConfig<ClientDefinition["config"], "output">;
  readonly atoms: PluginClientAtoms<ClientDefinition["atoms"]>;
  server!: PluginClientServer<ClientDefinition["$serverDef"], "internal">;
  readonly #agent: AgentClient<AgentClientDefinition>;

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
      ) => SerializableValue;
      callback: (
        newContext: PluginContext<ClientDefinition["$serverDef"]["context"], "output">,
        oldContext: PluginContext<ClientDefinition["$serverDef"]["context"], "output">,
      ) => void | Promise<void>;
    }
  >();
  // #telemetry: TelemetryClient;

  constructor(
    definition: ClientDefinition,
    config: PluginClientConfig<ClientDefinition["config"], "input">,
    agent: AgentClient<AgentClientDefinition>,
  ) {
    this._definition = definition;
    this.#agent = agent;
    this.config = definition.config.schema.parse(config) as PluginClientConfig<
      ClientDefinition["config"],
      "output"
    >;

    this.atoms = definition.atoms({
      config: this.config,
      server: {
        methods: op.toPublic(this.server.methods) as never,
        context: op.toPublic(this.server.context) as never,
        events: op.toPublic(this.server.events) as never,
      },
      dependencies: this.#dependencies,
    }) as PluginClientAtoms<ClientDefinition["atoms"]>;

    // Wire methods
    for (const name of Object.keys(definition.$serverDef.methods)) {
      this.server.methods[name as keyof typeof this.server.methods] = (input: unknown) =>
        agent.transport.call({
          name: `plugin.${this._definition.name}.methods.${name}`,
          input: input as SerializableValue,
          // biome-ignore lint/suspicious/noExplicitAny: no need further type precision here
        }) as any;
    }

    // Wire events
    this.server.events.emit = (input: unknown) =>
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
    });
    this.server.events.on = (...args: unknown[]) => {
      const [selector, callback] = args as Parameters<typeof this.server.events.on>;

      // Generate new listener id
      const id = newId("listener");

      // Register callback
      this.#eventsListeners.set(id, { id, callback });

      // Ask plugin's server to stream selected event
      agent.transport.call({
        name: `plugin.${this._definition.name}.events.subscribe`,
        input: { listenerId: id, selector },
        inputSchema: {
          input: z.object({ listenerId: z.string(), selector: z.any() }),
        },
      });

      // Return unsubscribe function
      return op.success(() => {
        // Stop subscription server-side
        agent.transport.call({
          name: `plugin.${this._definition.name}.events.unsubscribe`,
          input: { listenerId: id },
          inputSchema: {
            input: z.object({ listenerId: z.string() }),
          },
        });

        // Clean up callback
        this.#eventsListeners.delete(id);
      });
    };
    this.server.events.once = (...args: unknown[]) => {
      const [selector, callback] = args as Parameters<typeof this.server.events.once>;
      const unsubscribe = this.server.events.on(selector, async (event) => {
        unsubscribe?.[1]?.();
        await callback(event);
      });
      return unsubscribe;
    };

    // Wire context
    this.server.context.onChange = (...args: unknown[]) => {
      const [selector, callback] = args as Parameters<typeof this.server.context.onChange>;

      // Generate new listener id
      const listenerId = newId("listener");

      // Register callback
      this.#contextListeners.set(listenerId, {
        id: listenerId,
        callback,
        selector,
      });

      // Return unsubscribe function
      return op.success(() => {
        this.#contextListeners.delete(listenerId);
      });
    };
    this.server.context.get = () => op.attempt(() => deepClone(this.#contextValue));
    this.#agent.transport
      .call({
        name: `plugin.${this._definition.name}.context.get`,
      })
      .then((result) => {
        const [err, response] = result;
        if (err) {
          // Todo: Use telemetry client instead
          console.error(
            "Failed to fetch the initial context value for plugin",
            this._definition.name,
            err,
          );
          return;
        }

        // Validate output
        const { data: output, error: outputError } = z
          .object({ value: z.any(), timestamp: z.number() })
          .safeParse(response);
        if (outputError) {
          // Todo: Use telemetry client instead
          console.error(
            "Failed to validate the initial context value for plugin",
            this._definition.name,
            outputError,
          );
          return;
        }

        // Initialize context
        this.#lastContextValueTimestamp = output.timestamp ?? 0;
        this.#contextValue = output.value ?? {};

        // Send a first notification to listeners
        this.#notifyContextListeners({});
      });
    this.#agent.transport.register({
      name: `plugin.${this._definition.name}.context.changed`,
      schema: {
        input: z.object({ value: z.any(), timestamp: z.number() }),
      },
      execute: async ({ value, timestamp }) => {
        const oldContextValue = deepClone(this.#contextValue);
        if (timestamp > this.#lastContextValueTimestamp) {
          this.#lastContextValueTimestamp = timestamp;
          this.#contextValue = value;
        }
        await this.#notifyContextListeners(oldContextValue);
        return op.success();
      },
    });
  }

  async #notifyContextListeners(
    oldContextValue: PluginContext<ClientDefinition["$serverDef"]["context"], "output">,
  ) {
    await Promise.all(
      Array.from(this.#contextListeners.values()).map(async (listener) => {
        const newSelectedValue = listener.selector(this.#contextValue);
        const oldSelectedValue = listener.selector(oldContextValue);
        // Only call if value actually changed
        if (!canon.equal(newSelectedValue, oldSelectedValue)) {
          await listener.callback(deepClone(this.#contextValue), deepClone(oldContextValue));
        }
      }),
    );
  }
}
