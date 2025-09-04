import type z from "zod";
import { AgentClient } from "@/agent/client/class";
import type { AgentClientDefinition, GeneratedAgentClient } from "@/agent/client/types";
import type { agentConfig } from "@/agent/config";
import { type ClientBuild, importClientBuild } from "@/exports/build/client";
import type { LifeServer } from "@/server";

export class LifeClient {
  readonly #serverUrl: string;
  readonly #serverToken?: string;
  readonly #agents: Map<string, AgentClient<AgentClientDefinition>>;
  #clientBuild: ClientBuild | null = null;

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
  ): Promise<
    | { success: true; agent: GeneratedAgentClient<Name> }
    | { success: false; message: string; error?: unknown }
  > {
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

      const data: Awaited<ReturnType<LifeServer["createAgentProcess"]>> = await response.json();

      if (!data.success) {
        return { success: false, message: data.message || "Failed to create agent" };
      }

      // TypeScript narrows the type, but we still need runtime checks
      const { agentId, sessionToken, transportRoom, clientSideConfig } = data;

      if (!(agentId && sessionToken && transportRoom)) {
        return { success: false, message: "Server response missing required fields" };
      }

      // Load the client build if not already loaded
      if (!this.#clientBuild) {
        this.#clientBuild = await importClientBuild();
      }

      const agentBuild = this.#clientBuild[name as keyof ClientBuild];
      if (!agentBuild) {
        return { success: false, message: `Agent '${String(name)}' not found in client build` };
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
          clientSideConfig ?? ({ transport: {} } as z.output<typeof agentConfig.clientSchema>),
      }) as GeneratedAgentClient<Name>;

      this.#agents.set(agentId, agentClient);
      return { success: true, agent: agentClient };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error occurred",
        error,
      };
    }
  }

  /**
   * Get an existing agent client instance
   * @param id - Agent ID
   * @returns AgentClient instance or undefined
   */
  getAgent<Name extends keyof ClientBuild>(id: string): GeneratedAgentClient<Name> | undefined {
    return this.#agents.get(id) as GeneratedAgentClient<Name> | undefined;
  }

  /**
   * List all created agent instances
   * @returns Array of agent IDs
   */
  listAgents(): string[] {
    return Array.from(this.#agents.keys());
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
  ): Promise<GeneratedAgentClient<Name> | { success: false; message: string; error?: unknown }> {
    // Check if agent with same name already exists
    const existingAgent = Array.from(this.#agents.values()).find(
      (a) => a._definition.name === String(name),
    );

    if (existingAgent) {
      return existingAgent as GeneratedAgentClient<Name>;
    }

    const agentResult = await this.createAgent(name, scope);
    if (agentResult.success) {
      return agentResult.agent;
    }
    return { success: false, message: agentResult.message, error: agentResult.error };
  }

  /**
   * Get server information
   * @param token - Optional server token for authentication
   * @returns Server info response
   */
  async info(
    token?: string,
  ): Promise<
    | Awaited<ReturnType<LifeServer["getServerInfo"]>>
    | { success: false; message: string; error: unknown }
  > {
    try {
      const authToken = token || this.#serverToken;
      const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      const response = await fetch(`${this.#serverUrl}/server/info`, {
        method: "GET",
        headers,
      });

      const data = await response.json();
      return data;
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to get server info",
        error,
      };
    }
  }

  /**
   * Check if the server is responsive
   * @param token - Optional server token for authentication
   * @returns True if server responds with "pong"
   */
  async ping(
    token?: string,
  ): Promise<
    { success: true; pong: boolean } | { success: false; message: string; error: unknown }
  > {
    try {
      const authToken = token || this.#serverToken;
      const headers: HeadersInit = authToken ? { Authorization: `Bearer ${authToken}` } : {};

      const response = await fetch(`${this.#serverUrl}/server/ping`, {
        headers,
      });

      const text = await response.text();
      return { success: true, pong: text === "pong" };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : "Ping failed",
        error,
      };
    }
  }
}
