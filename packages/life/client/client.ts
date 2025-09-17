import type z from "zod";
import { AgentClient } from "@/agent/client/class";
import type { agentClientConfig } from "@/agent/client/config";
import type { AgentClientDefinition, GeneratedAgentClient } from "@/agent/client/types";
import { type ClientBuild, importClientBuild } from "@/exports/build/client";
import * as op from "@/shared/operation";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/browser";
import { LifeServerApiClient } from "./api";
import type { LifeClientOptions } from "./types";

export class LifeClient {
  readonly options: LifeClientOptions;
  readonly #serverToken?: string;
  readonly #agents: Map<string, AgentClient<AgentClientDefinition>>;
  #clientBuild: ClientBuild | null = null;
  readonly #telemetry: TelemetryClient;
  api: LifeServerApiClient;

  constructor(options: LifeClientOptions) {
    this.options = {
      serverUrl: options?.serverUrl ?? "http://localhost:3003",
      serverToken: options?.serverToken,
    };
    this.#agents = new Map();

    // Initialize API client
    this.api = new LifeServerApiClient({
      serverUrl: this.options.serverUrl,
      serverToken: this.options.serverToken,
    });

    // Initialize telemetry
    this.#telemetry = createTelemetryClient("client", {});
  }

  /**
   * Create a new agent instance on the server
   * @param name - Agent name/type to create
   * @param scope - Agent scope configuration
   * @returns AgentClient instance if creation successful
   */
  async createAgent<Name extends keyof ClientBuild>(name: Name, options: { id?: string } = {}) {
    return await this.#telemetry.trace("createAgent()", async (span) => {
      try {
        // Send a call to the server to create the agent
        const [err, data] = await this.api.call("agent.create", { name, id: options.id });
        if (err) return op.failure(err);

        // Load the client build if not already loaded
        if (!this.#clientBuild) this.#clientBuild = await importClientBuild();

        const agentBuild = this.#clientBuild[name as keyof ClientBuild];
        if (!agentBuild) {
          return op.failure({
            code: "NotFound",
            message: `Agent '${String(name)}' not found in client build.`,
          });
        }

        // Create agent client with proper definition and plugins from build
        const agentClient = new AgentClient({
          id: data.id,
          definition: agentBuild.definition,
          plugins: agentBuild.plugins,
          life: this,
          config:
            data.clientConfig ?? ({ transport: {} } as z.output<typeof agentClientConfig.schema>),
          // sessionToken: data.sessionToken,
          // transportRoom: data.transportRoom,
        }) as GeneratedAgentClient<Name>;
        this.#agents.set(data.id, agentClient);

        // Return the agent client
        return op.success(op.toPublic(agentClient));
      } catch (error) {
        span.log.error({
          message: "Unknown error while creating agent.",
          error,
          attributes: { name },
        });
        return op.failure({ code: "Unknown", error });
      }
    });
  }

  /**
   * Get an existing agent client instance
   * @param id - Agent ID
   * @returns AgentClient instance or undefined
   */
  getAgent<Name extends keyof ClientBuild>(id: string) {
    return this.#telemetry.trace("getAgent()", (span) => {
      try {
        const agent = this.#agents.get(id) as GeneratedAgentClient<Name> | undefined;
        return op.success(op.toPublic(agent));
      } catch (error) {
        span.log.error({
          message: "Unknown error while getting agent.",
          error,
          attributes: { id },
        });
        return op.failure({ code: "Unknown", error });
      }
    });
  }

  /**
   * List all created agent instances
   * @returns Array of agent IDs
   */
  listAgents() {
    return this.#telemetry.trace("listAgents()", (span) => {
      try {
        return op.success(Array.from(this.#agents.keys()));
      } catch (error) {
        span.log.error({ message: "Unknown error while listing agents.", error });
        return op.failure({ code: "Unknown", error });
      }
    });
  }

  /**
   * Get or create an agent instance
   * @param name - Agent name/type
   * @param scope - Agent scope configuration
   * @returns AgentClient instance
   */
  async getOrCreateAgent<Name extends keyof ClientBuild>(
    name: Name,
    options: { id?: string } = {},
  ) {
    return await this.#telemetry.trace("getOrCreateAgent()", async (span) => {
      try {
        // Check if agent with same name already exists
        const existingAgent = Array.from(this.#agents.values()).find(
          (a) => a._definition.name === String(name),
        );
        if (existingAgent) return op.success(existingAgent as GeneratedAgentClient<Name>);

        // Else, create a new agent
        const [err, agent] = await this.createAgent(name, options);
        if (err) return op.failure(err);
        return op.success(agent);
      } catch (error) {
        span.log.error({
          message: "Unknown error while getting or creating agent.",
          error,
          attributes: { name, options },
        });
        return op.failure({ code: "Unknown", error });
      }
    });
  }

  /**
   * Get server information
   * @returns Server info response
   */
  async info() {
    return await this.#telemetry.trace("info()", async (span) => {
      try {
        // Send a call to the server to get server information
        const [err, data] = await this.api.call("server.info");
        if (err) return op.failure(err);
        return op.success(data);
      } catch (error) {
        span.log.error({ message: "Failed to get server info.", error });
        return op.failure({ code: "Unknown", error });
      }
    });
  }

  /**
   * Check if the server is responsive
   * @returns True if server responds with "pong"
   */
  async ping() {
    return await this.#telemetry.trace("ping()", async (span) => {
      try {
        const [err, data] = await this.api.call("server.ping");
        if (err) return op.failure(err);
        if (data !== "pong")
          return op.failure({ code: "Unknown", message: `Ping failed. Received '${data}'.` });
        return op.success("pong");
      } catch (error) {
        span.log.error({ message: "Failed to ping server.", error });
        return op.failure({ code: "Unknown", error });
      }
    });
  }
}
