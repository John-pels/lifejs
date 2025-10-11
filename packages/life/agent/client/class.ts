import type z from "zod";
import type { LifeClient } from "@/client/client";
import type { PluginClientBase } from "@/plugins/client/class";
import type { PluginClientDefinition } from "@/plugins/client/types";
import * as op from "@/shared/operation";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/browser";
import { TransportBrowserClient } from "@/transport/client/browser";
import type { agentClientConfig } from "../client/config";
import type { AgentScope } from "../server/types";
import { type AgentClientAtoms, createAgentClientAtoms } from "./atoms";
import type { AgentClientDefinition, AgentClientPluginsMapping } from "./types";

export class AgentClient<const Definition extends AgentClientDefinition> {
  readonly _isAgentClient = true;
  readonly _definition: Definition;

  readonly id: string;
  readonly atoms: AgentClientAtoms;
  readonly config: z.output<typeof agentClientConfig.schema>;
  readonly transport: TransportBrowserClient;

  readonly #life: LifeClient;
  readonly #telemetry: TelemetryClient;

  #sessionToken?: string;
  #transportRoom?: { name: string; token: string };
  #scope?: AgentScope<Definition["$serverDef"]["scope"]>;

  isStarted = false;

  constructor(params: {
    id: string;
    definition: Definition;
    config: z.output<typeof agentClientConfig.schema>;
    life: LifeClient;
    plugins: AgentClientPluginsMapping;
  }) {
    this._definition = params.definition;
    this.id = params.id;
    this.config = params.config; // Already parsed by the server
    this.#life = params.life;

    // Initialize telemetry
    this.#telemetry = createTelemetryClient("agent.client", {
      agentId: this.id,
      agentName: this._definition.name,
      agentConfig: this.config,
      transportProviderName: this.config.transport.provider,
    });

    // Initialize transport
    this.transport = new TransportBrowserClient({
      config: this.config.transport,
      telemetry: this.#telemetry,
    });

    // Initialize atoms
    this.atoms = createAgentClientAtoms(this);

    // Initialize plugins
    const [errInitialize] = this.#initializePlugins(params.plugins);
    if (errInitialize) throw errInitialize;
  }

  #initializePlugins(plugins: AgentClientPluginsMapping) {
    return this.#telemetry.trace("#initializePlugins()", () => {
      try {
        // Validate plugins have unique names
        const pluginNames = Object.values(this._definition.plugins).map((plugin) => plugin.name);
        const duplicates = pluginNames.filter((name, index) => pluginNames.indexOf(name) !== index);
        if (duplicates.length > 0) {
          const uniqueDuplicates = [...new Set(duplicates)];
          return op.failure({
            code: "Validation",
            message: `Two or more plugins are named "${uniqueDuplicates.join('", "')}". Plugin names must be unique. (agent: '${this._definition.name}')`,
          });
        }

        // Validate plugin dependencies
        for (const plugin of Object.values(this._definition.plugins)) {
          for (const [depName] of Object.entries(plugin.dependencies || {})) {
            // - Ensure the plugin is provided
            const depPlugin = Object.values(this._definition.plugins).find(
              (p) => p.name === depName,
            );
            if (!depPlugin) {
              return op.failure({
                code: "Validation",
                message: `Plugin "${plugin.name}" depends on plugin "${depName}", but "${depName}" is not registered. (agent: '${this._definition.name}')`,
              });
            }
          }
        }

        // Instantiate plugins in parallel
        const initResults = Object.entries(plugins).map(([name, pluginInfo]) => {
          // Retrieve plugin class
          const PluginClass =
            pluginInfo.class as unknown as typeof PluginClientBase<PluginClientDefinition>;
          if (!PluginClass) {
            return op.failure({
              code: "Validation",
              message: `Plugin '${name}' class not found. Shouldn't happen.`,
            });
          }

          // Create plugin instance
          const [errPlugin, plugin] = op.attempt(
            () =>
              new PluginClass(
                pluginInfo.definition,
                (this._definition.pluginConfigs[name] ?? {}) as Record<string, unknown>,
                this,
              ),
          );
          if (errPlugin) {
            return op.failure({
              code: "Unknown",
              message: `Failed to initialize plugin '${name}'.`,
              cause: errPlugin,
            });
          }

          // Assign plugin instance to agent client
          this[name as keyof typeof this] = plugin as never;

          return op.success();
        });

        // Log all failures
        for (const result of initResults) {
          const [error] = result;
          if (error) this.#telemetry.log.error({ error });
        }

        return op.success();
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: "Unknown error while initializing plugins.",
          cause: error,
        });
      }
    });
  }

  /**
   * Start the agent and join the transport room
   * @returns Server response on successful start
   * @throws Error if the agent fails to start
   */
  async start(scope: AgentScope<Definition["$serverDef"]["scope"]>) {
    return await this.#telemetry.trace("start()", async (span) => {
      const [error] = await this.#start(scope);
      if (error) {
        span.log.error({ error });
        return op.failure(error);
      }
      return op.success();
    });
  }

  // Private method, doesn't log to telemetry
  async #start(scope: AgentScope<Definition["$serverDef"]["scope"]>) {
    return await this.#telemetry.trace("#start()", async () => {
      try {
        // Send a call to the server to start the agent
        const [errStart, data] = await this.#life.api.call("agent.start", { id: this.id, scope });
        if (errStart) return op.failure(errStart);
        this.#sessionToken = data.sessionToken;
        this.#transportRoom = data.transportRoom;
        this.#scope = scope;

        // Join the transport room
        const [errJoin] = await this.transport.joinRoom(
          this.#transportRoom.name,
          this.#transportRoom.token,
        );
        if (errJoin) return op.failure(errJoin);

        // Fetch initial plugin contexts
        const fetchContextResults = await Promise.all(
          Object.keys(this._definition.plugins).map(async (pluginName) => {
            const [error] = await op.attempt(async () => {
              const plugin = this?.[pluginName as keyof typeof this] as op.ToPublic<
                PluginClientBase<PluginClientDefinition>
              >;
              await plugin.refreshContext();
            });
            if (error) {
              return op.failure({
                code: "Unknown",
                message: `Failed to fetch initial plugin context for '${pluginName}'.`,
                cause: error,
              });
            }
            return op.success();
          }),
        );

        // Log all failures
        for (const result of fetchContextResults) {
          const [error] = result;
          if (error) this.#telemetry.log.error({ error });
        }

        // Enable microphone and audio
        const [errEnableMicrophone] = await this.transport.enableMicrophone();
        if (errEnableMicrophone) return op.failure(errEnableMicrophone);
        const [errPlayAudio] = await this.transport.playAudio();
        if (errPlayAudio) return op.failure(errPlayAudio);

        this.isStarted = true;

        // Refetch info atom
        this.atoms.info().refetch();

        return op.success();
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: "Unknown error while starting agent.",
          cause: error,
        });
      }
    });
  }

  /**
   * Stop the agent and leave the transport room
   * @returns Server response on successful stop
   * @throws Error if the agent fails to stop
   */
  async stop() {
    return await this.#telemetry.trace("stop()", async (span) => {
      const [error] = await this.#stop();
      if (error) {
        span.log.error({ error });
        return op.failure(error);
      }
      return op.success();
    });
  }

  // Private method, doesn't log to telemetry
  async #stop() {
    return await this.#telemetry.trace("#stop()", async () => {
      try {
        // Ensure sessionToken is set
        if (!this.#sessionToken) {
          return op.failure({ code: "Conflict", message: "Agent is not started." });
        }

        // Send a call to the server to stop the agent and leave the transport room
        const [apiResult, roomResult] = await Promise.all([
          this.#life.api.call("agent.stop", {
            id: this.id,
            sessionToken: this.#sessionToken,
          }),
          this.transport.leaveRoom(),
        ]);

        // Return error if any occurs
        if (apiResult[0]) return op.failure(apiResult[0]);
        if (roomResult[0]) return op.failure(roomResult[0]);

        this.isStarted = false;

        // Refetch info atom
        this.atoms.info().refetch();

        return op.success();
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: "Unknown error while stopping agent.",
          cause: error,
        });
      }
    });
  }

  /**
   * Restart the agent by stopping and starting it
   */
  async restart() {
    return await this.#telemetry.trace("restart()", async (span) => {
      const [error] = await this.#restart();
      if (error) {
        span.log.error({ error });
        return op.failure(error);
      }
      return op.success();
    });
  }

  // Private method, doesn't log to telemetry
  async #restart() {
    return await this.#telemetry.trace("#restart()", async () => {
      try {
        const [errStop] = await this.#stop();
        if (errStop) return op.failure(errStop);
        if (!this.#scope) {
          return op.failure({ code: "Conflict", message: "Agent is not started." });
        }
        const [errStart] = await this.#start(this.#scope);
        if (errStart) return op.failure(errStart);
        return op.success();
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: "Unknown error while restarting agent.",
          cause: error,
        });
      }
    });
  }

  /**
   * Get agent information from the server
   * @returns Agent information including status and metrics
   * @throws Error if unable to retrieve agent info
   */
  async info() {
    return await this.#telemetry.trace("info()", async (span) => {
      const [error, data] = await this.#info();
      if (error) {
        span.log.error({ error });
        return op.failure(error);
      }
      return op.success(data);
    });
  }

  // Private method, doesn't log to telemetry
  async #info() {
    return await this.#telemetry.trace("#info()", async () => {
      try {
        // Ensure sessionToken is set
        if (!this.#sessionToken) {
          return op.failure({ code: "Conflict", message: "Agent is not started." });
        }

        // Send a call to the server to get agent information
        const [err, data] = await this.#life.api.call("agent.info", {
          id: this.id,
          sessionToken: this.#sessionToken,
        });

        // Return error if any occurs
        if (err) return op.failure(err);

        return op.success(data);
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: "Unknown error while getting agent info.",
          cause: error,
        });
      }
    });
  }
}
