import type { Message } from "@huggingface/transformers";
import type { Dependencies, DependenciesAccessors } from "@/agent/core/types";
import type { CreateMessageInput } from "@/shared/messages";
import type { MaybePromise } from "@/shared/types";

// Memories
export interface MemoryOptions {
  behavior?: "blocking" | "non-blocking";
  position?: { section: "top" | "bottom"; align: "start" | "end" };
  disabled?: boolean;
}

export type MemoryOutput<Deps extends Dependencies = Dependencies> =
  | Message[]
  | CreateMessageInput[]
  | ((
      params: { messages: Message[] } & DependenciesAccessors<Deps>,
    ) => MaybePromise<Message[] | CreateMessageInput[] | undefined | null>);

export interface MemoryDefinition {
  name: string;
  dependencies: Dependencies;
  output: MemoryOutput;
  options: MemoryOptions;
}

export type MemoryDefinitions = MemoryDefinition[];

export interface MemoriesOptions {
  noDefaults?: boolean | string[];
}
