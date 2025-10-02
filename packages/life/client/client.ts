import { AgentClient } from "@/agent/client/class";
import type { AgentClientDefinition, GeneratedAgentClient } from "@/agent/client/types";
import { type ClientBuild, importClientBuild } from "@/exports/build/client";
import * as op from "@/shared/operation";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient, TelemetryBrowserClient } from "@/telemetry/clients/browser";
import { formatLogForBrowser } from "@/telemetry/helpers/formatting/browser";
import { logLevelPriority } from "@/telemetry/helpers/log-level-priority";
import type { TelemetryLogLevel } from "@/telemetry/types";
import { LifeServerApiClient } from "./api";
import type { LifeClientOptions } from "./types";

// Stream formatted telemetry logs to the terminal
TelemetryBrowserClient.registerGlobalConsumer({
  async start(queue) {
    for await (const item of queue) {
      if (item.type !== "log") continue;
      const logLevel = (globalThis?.process?.env?.LOG_LEVEL as TelemetryLogLevel) ?? "info";

      // Ignore logs lower than the requested log level
      const priority = logLevelPriority(item.level);
      if (priority < logLevelPriority(logLevel as TelemetryLogLevel)) continue;

      // Format and print the log
      try {
        const content = await formatLogForBrowser(item);
        let consoleFn: (line: string) => void;
        if (logLevelPriority("error") >= priority) consoleFn = console.error;
        else if (logLevelPriority("warn") >= priority) consoleFn = console.warn;
        else consoleFn = console.log;
        for (let i = 0; i < content.length; i++)
          consoleFn(`Life.js (${item.id.slice(0, 6)}, ${i + 1}/${content.length})\n${content[i]}`);
      } catch {
        console.log(item.message);
      }
    }
  },
});

export class LifeClient {
  readonly options: LifeClientOptions;
  readonly #agents = new Map<string, AgentClient<AgentClientDefinition>>();
  readonly #telemetry: TelemetryClient;
  api: LifeServerApiClient;

  constructor(options: LifeClientOptions) {
    this.options = {
      serverUrl: options?.serverUrl ?? "http://localhost:3003",
      serverToken: options?.serverToken,
    };

    // Initialize telemetry
    this.#telemetry = createTelemetryClient("client", {});

    // Initialize API client
    this.api = new LifeServerApiClient({
      telemetry: this.#telemetry,
      serverUrl: this.options.serverUrl,
      serverToken: this.options.serverToken,
    });
  }

  /**
   * Create a new agent instance on the server
   * @param name - Agent name/type to create
   * @param scope - Agent scope configuration
   * @returns AgentClient instance if creation successful
   */
  async createAgent<Name extends keyof ClientBuild>(name: Name, options: { id?: string } = {}) {
    return await this.#telemetry.trace("createAgent()", async (span) => {
      const [error, agent] = await this.#createAgent(name, options);
      if (error) {
        span.log.error({ error });
        return op.failure(error);
      }
      return op.success(agent);
    });
  }

  // Private method, doesn't log to telemetry
  async #createAgent<Name extends keyof ClientBuild>(name: Name, options: { id?: string } = {}) {
    return await this.#telemetry.trace("#createAgent()", async () => {
      try {
        // Load the client build if not already loaded
        const build = await importClientBuild();
        const agentBuild = build[name as keyof ClientBuild];
        if (!agentBuild) {
          return op.failure({
            code: "NotFound",
            message: `Agent '${String(name)}' not found in client build.`,
          });
        }

        // Send a call to the server to create the agent
        const [err, data] = await this.api.call("agent.create", { name, id: options.id });
        if (err) return op.failure(err);

        // Create agent client with proper definition and plugins from build
        const agentClient = new AgentClient({
          id: data.id,
          definition: agentBuild.definition,
          plugins: agentBuild.plugins,
          life: this,
          config: data.clientConfig ?? {},
        }) as GeneratedAgentClient<Name>;
        this.#agents.set(data.id, agentClient);

        // Return the agent client
        return op.success(op.toPublic(agentClient));
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: "Unknown error while creating agent.",
          cause: error,
        });
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
      const [error, agent] = this.#getAgent<Name>(id);
      if (error) {
        span.log.error({ error });
        return op.failure(error);
      }
      return op.success(agent);
    });
  }

  // Private method, doesn't log to telemetry
  #getAgent<Name extends keyof ClientBuild>(id: string) {
    return this.#telemetry.trace("#getAgent()", () => {
      try {
        const agent = this.#agents.get(id) as GeneratedAgentClient<Name> | undefined;
        return op.success(op.toPublic(agent));
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: "Unknown error while getting agent.",
          cause: error,
        });
      }
    });
  }

  /**
   * List all created agent instances
   * @returns Array of agent IDs
   */
  listAgents() {
    return this.#telemetry.trace("listAgents()", (span) => {
      const [error, agents] = this.#listAgents();
      if (error) {
        span.log.error({ error });
        return op.failure(error);
      }
      return op.success(agents);
    });
  }

  // Private method, doesn't log to telemetry
  #listAgents() {
    return this.#telemetry.trace("#listAgents()", () => {
      try {
        return op.success(Array.from(this.#agents.keys()));
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: "Unknown error while listing agents.",
          cause: error,
        });
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
      const [error, agent] = await this.#getOrCreateAgent(name, options);
      if (error) {
        span.log.error({ error });
        return op.failure(error);
      }
      return op.success(agent);
    });
  }

  // Private method, doesn't log to telemetry
  async #getOrCreateAgent<Name extends keyof ClientBuild>(
    name: Name,
    options: { id?: string } = {},
  ) {
    return await this.#telemetry.trace("#getOrCreateAgent()", async () => {
      try {
        // Check if agent with same name already exists
        const existingAgent = Array.from(this.#agents.values()).find(
          (a) => a._definition.name === String(name),
        );
        if (existingAgent) return op.success(existingAgent as GeneratedAgentClient<Name>);

        // Else, create a new agent
        const [err, agent] = await this.#createAgent(name, options);
        if (err) return op.failure(err);
        return op.success(agent);
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: "Unknown error while getting or creating agent.",
          cause: error,
        });
      }
    });
  }

  /**
   * Get server information
   * @returns Server info response
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
    return await this.#telemetry.trace("info()", async () => {
      try {
        // Send a call to the server to get server information
        const [err, data] = await this.api.call("server.info");
        if (err) return op.failure(err);
        return op.success(data);
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: "Unknown error while getting server info.",
          cause: error,
        });
      }
    });
  }

  /**
   * Check if the server is responsive
   * @returns True if server responds with "pong"
   */
  async ping() {
    return await this.#telemetry.trace("ping()", async (span) => {
      const [error, data] = await this.#ping();
      if (error) {
        span.log.error({ error });
        return op.failure(error);
      }
      return op.success(data);
    });
  }

  // Private method, doesn't log to telemetry
  async #ping() {
    return await this.#telemetry.trace("#ping()", async () => {
      try {
        const [err, data] = await this.api.call("server.ping");
        if (err) return op.failure(err);
        if (data !== "pong")
          return op.failure({
            code: "Validation",
            message: `Ping failed. Received wrong response: '${data}'.`,
          });
        return op.success("pong");
      } catch (error) {
        return op.failure({
          code: "Unknown",
          message: "Unknown error while pinging server.",
          cause: error,
        });
      }
    });
  }
}
