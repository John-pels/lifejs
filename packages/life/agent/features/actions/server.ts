import type { LLMTool } from "@/models/llm/types";
import { op } from "@/shared/operation";
import type { ActionDefinition, ActionExecute, ActionOptions } from "../types";
import type { AgentServer } from "./agent";

export class ActionServer {
  readonly #agent: AgentServer;
  readonly definition: ActionDefinition;
  readonly options: ActionOptions = {
    disabled: false,
  };

  constructor(agent: AgentServer, definition: ActionDefinition) {
    this.#agent = agent;
    this.definition = definition;
  }

  async execute(
    input: Record<string, unknown>,
  ): Promise<op.OperationResult<ReturnType<ActionExecute>>> {
    const result = await this.definition.execute({
      input,
      actions: this.#agent.actions,
      memories: this.#agent.memories,
      stores: this.#agent.stores,
    });
    return op.success(result);
  }

  toLLMTool(): LLMTool {
    return {
      name: this.definition.name,
      description: this.definition.description,
      inputSchema: this.definition.inputSchema,
      outputSchema: this.definition.outputSchema,
      execute: (input: Record<string, unknown>) =>
        this.definition.execute({
          input,
          actions: this.#agent.actions,
          memories: this.#agent.memories,
          stores: this.#agent.stores,
        }),
    };
  }
}
