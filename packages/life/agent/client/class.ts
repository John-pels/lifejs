import type z from "zod";
import type { LifeServer } from "@/server";
import { TransportClient } from "@/transport/client";
import type { agentConfig } from "../config";
import { type AgentClientAtoms, createAgentClientAtoms } from "./atoms";
import type { AgentClientDefinition, AgentClientPluginsMapping } from "./types";

export class AgentClient<const Definition extends AgentClientDefinition> {
  readonly _isAgentClient = true;
  readonly _definition: Definition;
  readonly id: string;
  readonly transport: TransportClient;
  readonly atoms: AgentClientAtoms;
  readonly #serverUrl: string;
  readonly #sessionToken: string;
  readonly #transportRoom: { name: string; token: string };
  readonly #config: z.output<typeof agentConfig.clientSchema>;

  constructor(params: {
    id: string;
    definition: Definition;
    plugins: AgentClientPluginsMapping;
    serverUrl: string;
    sessionToken: string;
    transportRoom: { name: string; token: string };
    config: z.output<typeof agentConfig.clientSchema>;
  }) {
    this.id = params.id;
    this._definition = params.definition;
    this.#serverUrl = params.serverUrl ?? "ws://localhost:8080";
    this.#sessionToken = params.sessionToken;
    this.#transportRoom = params.transportRoom;
    this.#config = params.config;

    // Initialize transport
    this.transport = new TransportClient(this.#config.transport);

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
      // @ts-expect-error
      this[name] = new plugins[name](pluginDef, this._definition.pluginConfigs[name], this);
    }
  }

  /**
   * Start the agent and join the transport room
   * @returns Server response on successful start
   * @throws Error if the agent fails to start
   */
  async start(): Promise<
    | Awaited<ReturnType<LifeServer["startAgentProcess"]>>
    | { success: false; message: string; error: unknown }
  > {
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
        throw new Error(apiResponse.message || "Failed to start agent");
      }

      return apiResponse;
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown error occurred while starting agent",
        error,
      };
    }
  }

  /**
   * Stop the agent and leave the transport room
   * @returns Server response on successful stop
   * @throws Error if the agent fails to stop
   */
  async stop(): Promise<
    | Awaited<ReturnType<LifeServer["stopAgentProcess"]>>
    | { success: false; message: string; error: unknown }
  > {
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
        throw new Error(apiResponse.message || "Failed to stop agent");
      }

      return apiResponse;
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Unknown error occurred while stopping agent",
        error,
      };
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
      const stopResult = await this.stop();
      if (!stopResult.success) return stopResult;
      const startResult = await this.start();
      if (!startResult.success) return startResult;
      return { success: true };
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
   * Check if the server is responsive
   * @returns True if server responds with "pong"
   */
  async ping() {
    try {
      const response = await fetch(`${this.#serverUrl}/server/ping`);
      const text = await response.text();
      return text === "pong";
    } catch (error) {
      console.error("Ping failed:", error);
      return false;
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
