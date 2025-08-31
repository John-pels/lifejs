import z from "zod";
import type { AgentClient } from "@/agent/client/class";
import type { AgentClientDefinition } from "@/agent/client/types";
import { canon, type SerializableValue } from "@/shared/canon";
import { klona } from "@/shared/klona";
import { newId } from "@/shared/prefixed-id";
import type { PluginContext } from "../server/types";
import type {
  PluginClientAtoms,
  PluginClientConfig,
  PluginClientContextHandler,
  PluginClientDefinition,
  PluginClientDependencies,
  PluginClientEventsHandler,
  PluginClientMethods,
} from "./types";

export class PluginClientBase<ClientDefinition extends PluginClientDefinition> {
  readonly _definition: ClientDefinition;
  readonly config: PluginClientConfig<ClientDefinition["config"], "output">;
  readonly atoms: PluginClientAtoms<ClientDefinition["atoms"]>;
  readonly agent: AgentClient<AgentClientDefinition>;
  readonly methods = {} as PluginClientMethods<ClientDefinition["$serverDef"]["methods"]>;
  readonly context = {} as PluginClientContextHandler<
    PluginContext<ClientDefinition["$serverDef"]["context"], "output">
  >;
  readonly events = {} as PluginClientEventsHandler<ClientDefinition["$serverDef"]["events"]>;
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
      callback: (newValue: SerializableValue, oldValue: SerializableValue) => void | Promise<void>;
    }
  >();
  // telemetry: TelemetryClient;

  constructor(
    definition: ClientDefinition,
    config: PluginClientConfig<ClientDefinition["config"], "input">,
    agent: AgentClient<AgentClientDefinition>,
  ) {
    this._definition = definition;
    this.agent = agent;
    this.config = definition.config.parse(config) as PluginClientConfig<
      ClientDefinition["config"],
      "output"
    >;
    this.atoms = definition.atoms({ client: this }) as PluginClientAtoms<ClientDefinition["atoms"]>;

    // Wire methods
    for (const name of Object.keys(definition.$serverDef.methods)) {
      this.methods[name as keyof typeof this.methods] = (...args: unknown[]) =>
        agent.transport.call({
          name: `plugin.${this._definition.name}.methods.${name}`,
          args,
        });
    }

    // Wire events
    this.events.emit = (...args: unknown[]) =>
      agent.transport.call({
        name: `plugin.${this._definition.name}.events.emit`,
        args,
      });
    agent.transport.register({
      name: `plugin.${this._definition.name}.events.callback`,
      schema: z
        .function()
        .args(
          z.object({
            listenerId: z.string(),
            event: z.object({ type: z.string(), id: z.string(), data: z.any() }),
          }),
        )
        .returns(z.void()),
      execute: async ({ listenerId, event }) => {
        await this.#eventsListeners.get(listenerId)?.callback(event);
      },
    });
    this.events.on = (...args: unknown[]) => {
      const [selector, callback] = args as Parameters<typeof this.events.on>;

      // Generate new listener id
      const id = newId("listener");

      // Register callback
      this.#eventsListeners.set(id, { id, callback });

      // Ask plugin's server to stream selected event
      agent.transport.call({
        name: `plugin.${this._definition.name}.events.subscribe`,
        args: { listenerId: id, selector },
      });

      // Return unsubscribe function
      return () => {
        // Stop subscription server-side
        agent.transport.call({
          name: `plugin.${this._definition.name}.events.unsubscribe`,
          args: { listenerId: id },
        });

        // Clean up callback
        this.#eventsListeners.delete(id);
      };
    };
    this.events.once = (...args: unknown[]) => {
      const [selector, callback] = args as Parameters<typeof this.events.once>;
      const unsubscribe = this.events.on(selector, async (event) => {
        unsubscribe();
        await callback(event);
      });
      return unsubscribe;
    };

    // Wire context
    this.context.onChange = (...args: unknown[]) => {
      const [selector, callback] = args as Parameters<typeof this.context.onChange>;

      // Generate new listener id
      const listenerId = newId("listener");

      // Register callback
      this.#contextListeners.set(listenerId, {
        id: listenerId,
        callback,
        selector,
      });

      // Return unsubscribe function
      return () => {
        this.#contextListeners.delete(listenerId);
      };
    };
    this.context.get = () => klona(this.#contextValue);
    this.agent.transport
      .call({
        name: `plugin.${this._definition.name}.context.get`,
      })
      .then((response) => {
        if (response.status === "error") {
          // Todo: Use telemetry client instead
          console.error(
            "Failed to fetch the initial context value for plugin",
            this._definition.name,
          );
          return;
        }
        this.#lastContextValueTimestamp = response.data.timestamp;
        this.#contextValue = response.data.value;
        this.#notifyContextListeners({});
      });
    this.agent.transport.register({
      name: `plugin.${this._definition.name}.context.changed`,
      schema: z
        .function()
        .args(z.object({ value: z.any(), timestamp: z.number() }))
        .returns(z.void()),
      execute: async ({ value, timestamp }) => {
        const oldContextValue = klona(this.#contextValue);
        if (timestamp > this.#lastContextValueTimestamp) {
          this.#lastContextValueTimestamp = timestamp;
          this.#contextValue = value;
        }
        await this.#notifyContextListeners(oldContextValue);
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
          await listener.callback(newSelectedValue, oldSelectedValue);
        }
      }),
    );
  }

  get dependencies() {
    const dependencies = {} as PluginClientDependencies<ClientDefinition["dependencies"]>;
    for (const [depName] of Object.entries(this._definition.dependencies ?? {})) {
      // @ts-expect-error - this.agent is an agent client and has a plugins properties
      dependencies[depName as keyof typeof dependencies] = this.agent[depName];
    }
    return dependencies;
  }
}
