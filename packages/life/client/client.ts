import type z from "zod";
import { AgentClient } from "@/agent/client/class";
import type { agentClientConfig } from "@/agent/client/config";
import type { AgentClientDefinition, GeneratedAgentClient } from "@/agent/client/types";
import { type ClientBuild, importClientBuild } from "@/exports/build/client";
import type { LifeServer } from "@/server";
import * as op from "@/shared/operation";
// import type { LifeServerApiClient } from "./api";

export class LifeClient {
  readonly #serverUrl: string;
  readonly #serverToken?: string;
  readonly #agents: Map<string, AgentClient<AgentClientDefinition>>;
  #clientBuild: ClientBuild | null = null;
  // api: LifeServerApiClient;

  constructor(params?: { serverUrl?: string; serverToken?: string }) {
    this.#serverUrl = params?.serverUrl ?? "http://localhost:3003";
    this.#serverToken = params?.serverToken;
    this.#agents = new Map();
  }

  /**
   * Create a new agent instance on the server
   * @param name - Agent name/type to create
   * @param scope - Agent scope configuration
   * @returns AgentClient instance if creation successful
   */
  async createAgent<Name extends keyof ClientBuild>(
    name: Name,
    scope: Record<string, unknown> = {},
  ) {
    try {
      const response = await fetch(`${this.#serverUrl}/agent/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          agentName: name,
          scope,
        }),
      });
      const [err, data]: Awaited<ReturnType<LifeServer["createAgentProcess"]>> =
        await response.json();
      if (err) return op.failure(err);

      // TypeScript narrows the type, but we still need runtime checks
      const { agentId, sessionToken, transportRoom, clientSideConfig } = data;

      if (!(agentId && sessionToken && transportRoom)) {
        return op.failure({
          code: "Validation",
          message: "Server response missing required fields",
        });
      }

      // Load the client build if not already loaded
      if (!this.#clientBuild) {
        this.#clientBuild = await importClientBuild();
      }

      const agentBuild = this.#clientBuild[name as keyof ClientBuild];
      if (!agentBuild) {
        return op.failure({
          code: "NotFound",
          message: `Agent '${String(name)}' not found in client build`,
        });
      }

      // Create agent client with proper definition and plugins from build
      const agentClient = new AgentClient({
        id: agentId,
        definition: agentBuild.definition,
        plugins: agentBuild.plugins,
        serverUrl: this.#serverUrl,
        sessionToken,
        transportRoom,
        config:
          clientSideConfig ?? ({ transport: {} } as z.output<typeof agentClientConfig.schema>),
      }) as GeneratedAgentClient<Name>;

      this.#agents.set(agentId, agentClient);
      return op.success(op.toPublic(agentClient));
    } catch (error) {
      const message = "Failed to create agent.";
      // this.#telemetry.log.error({ message, error, attributes: { agentId, name } });
      return op.failure({ code: "Unknown", message, error });
    }
  }

  /**
   * Get an existing agent client instance
   * @param id - Agent ID
   * @returns AgentClient instance or undefined
   */
  getAgent<Name extends keyof ClientBuild>(id: string) {
    try {
      const agent = this.#agents.get(id) as GeneratedAgentClient<Name> | undefined;
      return op.success(op.toPublic(agent));
    } catch (error) {
      const message = "Failed to get agent.";
      // this.#telemetry.log.error({ message, error, attributes: { id } });
      return op.failure({ code: "Unknown", message, error });
    }
  }

  /**
   * List all created agent instances
   * @returns Array of agent IDs
   */
  listAgents() {
    try {
      return op.success(Array.from(this.#agents.keys()));
    } catch (error) {
      const message = "Failed to list agents.";
      // this.#telemetry.log.error({ message, error });
      return op.failure({ code: "Unknown", message, error });
    }
  }

  /**
   * Get or create an agent instance
   * @param name - Agent name/type
   * @param scope - Agent scope configuration
   * @returns AgentClient instance
   */
  async getOrCreateAgent<Name extends keyof ClientBuild>(
    name: Name,
    scope: Record<string, unknown> = {},
  ) {
    try {
      // Check if agent with same name already exists
      const existingAgent = Array.from(this.#agents.values()).find(
        (a) => a._definition.name === String(name),
      );
      if (existingAgent) return op.success(existingAgent as GeneratedAgentClient<Name>);

      // Else, create a new agent
      const [err, agent] = await this.createAgent(name, scope);
      if (err) return op.failure(err);
      return op.success(agent);
    } catch (error) {
      const message = "Failed to get or create agent.";
      // this.#telemetry.log.error({ message, error, attributes: { name, scope } });
      return op.failure({ code: "Unknown", message, error });
    }
  }

  /**
   * Get server information
   * @param serverToken - Optional server token for authentication
   * @returns Server info response
   */
  async info(serverToken?: string) {
    try {
      const authToken = serverToken || this.#serverToken;
      const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      const response = await fetch(`${this.#serverUrl}/server/info`, {
        method: "GET",
        headers,
      });

      const data = (await response.json()) as Awaited<ReturnType<LifeServer["getServerInfo"]>>;
      return op.success(data);
    } catch (error) {
      const message = "Failed to get server info.";
      // this.#telemetry.log.error({ message, error });
      return op.failure({ code: "Unknown", message, error });
    }
  }

  /**
   * Check if the server is responsive
   * @param serverToken - Optional server token for authentication
   * @returns True if server responds with "pong"
   */
  async ping(serverToken?: string) {
    try {
      const authToken = serverToken || this.#serverToken;
      const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      const response = await fetch(`${this.#serverUrl}/server/ping`, {
        headers,
      });

      const text = await response.text();
      if (text !== "pong")
        return op.failure({ code: "Unknown", message: `Ping failed. Received '${text}'.` });
      return op.success("pong");
    } catch (error) {
      const message = "Failed to ping server.";
      // this.#telemetry.log.error({ message, error });
      return op.failure({ code: "Unknown", message, error });
    }
  }
}
