import type { Message } from "@huggingface/transformers";
import type { DependenciesAccessors, FeatureDependencies } from "@/agent/core/types";
import type { CreateMessageInput } from "@/shared/messages";
import type { MaybePromise } from "@/shared/types";

// Memories
export interface MemoryOptions {
  behavior?: "blocking" | "non-blocking";
  position?: { section: "top" | "bottom"; align: "start" | "end" };
  disabled?: boolean;
}

export type MemoryOutput<Deps extends FeatureDependencies = FeatureDependencies> =
  | Message[]
  | CreateMessageInput[]
  | ((
      params: { messages: Message[] } & DependenciesAccessors<Deps>,
    ) => MaybePromise<Message[] | CreateMessageInput[] | undefined | null>);

export interface MemoryDefinition {
  name: string;
  dependencies: FeatureDependencies;
  output: MemoryOutput;
  options: MemoryOptions;
}

export type MemoryDefinitions = MemoryDefinition[];

export interface MemoriesOptions {
  noDefaults?: boolean | string[];
}
