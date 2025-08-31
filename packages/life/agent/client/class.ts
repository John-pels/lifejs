import { newId } from "@/shared/prefixed-id";
import { TransportClient } from "@/transport/client";
import type { AgentClientDefinition, AgentClientPluginsMapping } from "./types";

export class AgentClient<const Definition extends AgentClientDefinition> {
  readonly _definition: Definition;
  readonly _isAgentClient = true;
  readonly id: string;
  readonly transport: TransportClient;

  constructor(params: {
    definition: Definition;
    plugins: AgentClientPluginsMapping;
    id?: string;
  }) {
    this.id = params.id ?? newId("agent");
    this._definition = params.definition;

    // Initialize transport
    this.transport = new TransportClient(params.definition.config.transport);

    // Validate plugins
    this.#validatePlugins();

    // Initialize plugins
    this.#initializePlugins(params.plugins);
  }

  #validatePlugins() {
    // Validate plugins have unique names
    const pluginNames = Object.values(this._definition.plugins).map((plugin) => plugin.name);
    const duplicates = pluginNames.filter((name, index) => pluginNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      const uniqueDuplicates = [...new Set(duplicates)];
      throw new Error(
        `Two or more plugins are named "${uniqueDuplicates.join('", "')}". Plugin names must be unique. (agent: '${this._definition.name}')`,
      );
    }

    // Validate plugin dependencies
    for (const plugin of Object.values(this._definition.plugins)) {
      for (const [depName] of Object.entries(plugin.dependencies || {})) {
        // - Ensure the plugin is provided
        const depPlugin = Object.values(this._definition.plugins).find((p) => p.name === depName);
        if (!depPlugin) {
          throw new Error(
            `Plugin "${plugin.name}" depends on plugin "${depName}", but "${depName}" is not registered. (agent: '${this._definition.name}')`,
          );
        }
      }
    }
  }

  #initializePlugins(plugins: AgentClientPluginsMapping) {
    for (const [name, pluginDef] of Object.entries(this._definition.plugins)) {
      // @ts-expect-error
      this[name] = new plugins[name](pluginDef, this._definition.pluginConfigs[name], this);
    }
  }

  async invite() {
    // Connect to the agent via transport
    // TODO: Implement transport connection
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(`Inviting agent: ${this._definition.name}`);
  }

  async leave() {
    // Disconnect from the agent
    // TODO: Implement transport disconnection
    await new Promise((resolve) => setTimeout(resolve, 1000));
    console.log(`Leaving agent: ${this._definition.name}`);
  }
}
