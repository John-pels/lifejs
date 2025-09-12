import type z from "zod";
import type { PluginClientBase } from "@/plugins/client/class";
import type { PluginClientDefinition } from "@/plugins/client/types";
import type { LifeServer } from "@/server";
import * as op from "@/shared/operation";
import { TransportBrowserClient } from "@/transport/client/browser";
import type { agentClientConfig } from "../config";
import { type AgentClientAtoms, createAgentClientAtoms } from "./atoms";
import type { AgentClientDefinition, AgentClientPluginsMapping } from "./types";

export class AgentClient<const Definition extends AgentClientDefinition> {
  readonly _isAgentClient = true;
  readonly _definition: Definition;
  readonly id: string;
  readonly transport: TransportBrowserClient;
  readonly atoms: AgentClientAtoms;
  readonly #serverUrl: string;
  readonly #sessionToken: string;
  readonly #transportRoom: { name: string; token: string };
  readonly #config: z.output<typeof agentClientConfig.schema>;

  constructor(params: {
    id: string;
    definition: Definition;
    plugins: AgentClientPluginsMapping;
    serverUrl: string;
    sessionToken: string;
    transportRoom: { name: string; token: string };
    config: z.output<typeof agentClientConfig.schema>;
  }) {
    this.id = params.id;
    this._definition = params.definition;
    this.#serverUrl = params.serverUrl ?? "ws://localhost:8080";
    this.#sessionToken = params.sessionToken;
    this.#transportRoom = params.transportRoom;
    this.#config = params.config;

    // Initialize transport
    this.transport = new TransportBrowserClient(this.#config.transport);

    // Initialize atoms
    this.atoms = createAgentClientAtoms(this);

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
      // Retrieve plugin class
      const PluginClass = plugins[name as keyof typeof plugins]
        ?.class as unknown as typeof PluginClientBase<PluginClientDefinition>;
      if (!PluginClass) return;

      // Create plugin instance
      const plugin = op.toPublic(
        new PluginClass(
          pluginDef,
          this._definition.pluginConfigs[name] as Record<string, unknown>,
          this,
        ),
      );

      // Make server methods, events, and context public
      plugin.server.methods = op.toPublic(plugin.server.methods) as never;
      plugin.server.events = op.toPublic(plugin.server.events) as never;
      plugin.server.context = op.toPublic(plugin.server.context) as never;

      // Assign plugin instance to agent client
      this[name as keyof typeof this] = plugin as never;
    }
  }

  /**
   * Start the agent and join the transport room
   * @returns Server response on successful start
   * @throws Error if the agent fails to start
   */
  async start() {
    try {
      const [apiResponse] = await Promise.all([
        fetch(`${this.#serverUrl}/agent/start`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agentId: this.id,
            sessionToken: this.#sessionToken,
          }),
        }).then((res) => res.json()),
        this.transport.joinRoom(this.#transportRoom.name, this.#transportRoom.token),
      ]);

      if (!apiResponse.success) {
        return op.failure({
          code: "Unknown",
          message: "Failed to start agent",
          error: apiResponse,
        });
      }

      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  /**
   * Stop the agent and leave the transport room
   * @returns Server response on successful stop
   * @throws Error if the agent fails to stop
   */
  async stop() {
    try {
      const [apiResponse] = await Promise.all([
        fetch(`${this.#serverUrl}/agent/stop`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            agentId: this.id,
            sessionToken: this.#sessionToken,
          }),
        }).then((res) => res.json()),
        this.transport.leaveRoom(),
      ]);

      if (!apiResponse.success) {
        return op.failure({ code: "Unknown", message: "Failed to stop agent", error: apiResponse });
      }

      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  /**
   * Restart the agent by stopping and starting it
   */
  async restart(): Promise<
    | Awaited<ReturnType<LifeServer["stopAgentProcess"]>>
    | Awaited<ReturnType<LifeServer["startAgentProcess"]>>
    | { success: false; message: string; error: unknown }
  > {
    try {
      const [errStop] = await this.stop();
      if (errStop) return op.failure(errStop);
      const [errStart] = await this.start();
      if (errStart) return op.failure(errStart);
      return op.success();
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown error occurred while restarting agent",
        error,
      };
    }
  }

  /**
   * Get agent information from the server
   * @returns Agent information including status and metrics
   * @throws Error if unable to retrieve agent info
   */
  async info(): Promise<
    | Awaited<ReturnType<LifeServer["getAgentProcessInfo"]>>
    | { success: false; message: string; error: unknown }
  > {
    try {
      const response = await fetch(`${this.#serverUrl}/agent/info`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentId: this.id,
          sessionToken: this.#sessionToken,
        }),
      });

      const data = await response.json();
      if (!data.success) {
        throw new Error(data.message || "Failed to get agent info");
      }

      return data;
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Unknown error occurred while fetching agent info",
        error,
      };
    }
  }
}
