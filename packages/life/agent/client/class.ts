import type z from "zod";
import type { LifeServerApiClient } from "@/client/api";
import type { PluginClientBase } from "@/plugins/client/class";
import type { PluginClientDefinition } from "@/plugins/client/types";
import * as op from "@/shared/operation";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/browser";
import { TransportBrowserClient } from "@/transport/client/browser";
import type { agentClientConfig } from "../client/config";
import { type AgentClientAtoms, createAgentClientAtoms } from "./atoms";
import type { AgentClientDefinition, AgentClientPluginsMapping } from "./types";

export class AgentClient<const Definition extends AgentClientDefinition> {
  readonly _isAgentClient = true;
  readonly _definition: Definition;
  readonly id: string;
  readonly transport: TransportBrowserClient;
  readonly atoms: AgentClientAtoms;
  readonly config: z.output<typeof agentClientConfig.schema>;
  readonly api: LifeServerApiClient;
  readonly #sessionToken: string;
  readonly #transportRoom: { name: string; token: string };
  readonly #telemetry: TelemetryClient;

  constructor(params: {
    id: string;
    definition: Definition;
    plugins: AgentClientPluginsMapping;
    serverUrl: string;
    sessionToken: string;
    transportRoom: { name: string; token: string };
    config: z.output<typeof agentClientConfig.schema>;
    api: LifeServerApiClient;
  }) {
    this._definition = params.definition;
    this.id = params.id;
    this.config = params.config;
    this.api = params.api;
    this.#sessionToken = params.sessionToken;
    this.#transportRoom = params.transportRoom;

    // Initialize telemetry
    this.#telemetry = createTelemetryClient("agent.client", {
      agentId: this.id,
      agentName: this._definition.name,
      agentConfig: this.config,
      transportProviderName: this.config.transport.provider,
    });

    // Initialize transport
    this.transport = new TransportBrowserClient({ config: this.config.transport });

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
      // Send a call to the server to start the agent and join the transport room
      const [apiResult, roomResult] = await Promise.all([
        this.api.call("agent.start", {
          agentId: this.id,
          sessionToken: this.#sessionToken,
        }),
        this.transport.joinRoom(this.#transportRoom.name, this.#transportRoom.token),
      ]);

      // Return error if any occurs
      if (apiResult[0]) return op.failure(apiResult[0]);
      if (roomResult[0]) return op.failure(roomResult[0]);

      return op.success();
    } catch (error) {
      this.#telemetry.log.error({ message: "Failed to start agent", error });
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
      // Send a call to the server to stop the agent and leave the transport room
      const [apiResult, roomResult] = await Promise.all([
        this.api.call("agent.stop", {
          agentId: this.id,
          sessionToken: this.#sessionToken,
        }),
        this.transport.leaveRoom(),
      ]);

      // Return error if any occurs
      if (apiResult[0]) return op.failure(apiResult[0]);
      if (roomResult[0]) return op.failure(roomResult[0]);

      return op.success();
    } catch (error) {
      this.#telemetry.log.error({ message: "Failed to stop agent", error });
      return op.failure({ code: "Unknown", error });
    }
  }

  /**
   * Restart the agent by stopping and starting it
   */
  async restart() {
    try {
      const [errStop] = await this.stop();
      if (errStop) return op.failure(errStop);
      const [errStart] = await this.start();
      if (errStart) return op.failure(errStart);
      return op.success();
    } catch (error) {
      this.#telemetry.log.error({ message: "Failed to restart agent", error });
      return op.failure({ code: "Unknown", error });
    }
  }

  /**
   * Get agent information from the server
   * @returns Agent information including status and metrics
   * @throws Error if unable to retrieve agent info
   */
  async info() {
    try {
      // Send a call to the server to get agent information
      const [err, data] = await this.api.call("agent.info", {
        agentId: this.id,
        sessionToken: this.#sessionToken,
      });

      // Return error if any occurs
      if (err) return op.failure(err);

      return op.success(data);
    } catch (error) {
      this.#telemetry.log.error({ message: "Failed to get agent info", error });
      return op.failure({ code: "Unknown", error });
    }
  }
}
