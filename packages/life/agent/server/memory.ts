import type { Message } from "../messages";
import type { MemoryDefinition, MemoryOptions } from "../types";
import type { AgentServer } from "./agent";

// interface MemoryAccessor {
//   setOptions: (options: MemoryOptions) => void;
//   get(): Promise<Message[] | null>;
//   refresh(): Promise<void>;
// }

export class MemoryServer {
  readonly #agent: AgentServer;
  readonly #definition: MemoryDefinition;
  readonly options: MemoryOptions = {
    behavior: "blocking",
    position: { section: "top", align: "end" },
    disabled: false,
  };
  priority = 0;

  constructor(agent: AgentServer, definition: MemoryDefinition) {
    this.#agent = agent;
    this.#definition = definition;

    const positionToIndex = (position?: {
      section?: "top" | "bottom";
      align?: "start" | "end";
    }) => {
      const section = position?.section ?? "bottom";
      const align = position?.align ?? "end";
      if (section === "top") return align === "start" ? 1 : 2;
      return align === "start" ? 3 : 4;
    };
    this.priority = positionToIndex(this.#options.position);
  }

  setOptions(options: MemoryOptions) {
    this.#options = options;
  }

  async get(): Promise<Message[]> {
    //---------

    const computeMemory = async (memory: MemoryDefinition) => {
      const memoryMessagesInputs =
        (typeof memory.output === "function"
          ? await memory.output({
              messages: contextValue.messages,
              memories: {},
              actions: {},
              stores: {},
            })
          : memory.output) ?? [];
      const memoryMessagesOutputs = memoryMessagesInputs
        .map((input) => {
          const [_err, message] = prepareMessageInput(input);
          if (message) return message;
          return null;
        })
        .filter((message) => message !== null);
      return await {
        name: memory.name,
        options: memory.options,
        messages: memoryMessagesOutputs,
      };
    };
    const computedMemories = await Promise.all(memories.map(computeMemory));

    // ------

    // Obtain
    const memoryMessagesInputs =
      (typeof this.#definition.output === "function"
        ? await this.#definition.output({
            messages: contextValue.messages,
            memories: {},
            actions: {},
            stores: {},
          })
        : memory.output) ?? [];
    const memoryMessagesOutputs = memoryMessagesInputs
      .map((input) => {
        const [_err, message] = prepareMessageInput(input);
        if (message) return message;
        return null;
      })
      .filter((message) => message !== null);
    return await {
      name: memory.name,
      options: memory.options,
      messages: memoryMessagesOutputs,
    };
  }

  get() {
    return this.#definition.output;
  }

  set(value: any) {
    this.#definition.output = value;
  }
}
