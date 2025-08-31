import { z } from "zod";
import type { Message } from "@/shared/resources";

// - Dependencies
interface _MemoryDependenciesDefinition {
  stores: { name: string }[];
  collections: { name: string }[];
}

type MemoryDependenciesDefinition =
  | _MemoryDependenciesDefinition
  | { _definition: _MemoryDependenciesDefinition };

// - Config
export const memoryConfigSchema = z.object({
  behavior: z.enum(["blocking", "non-blocking"]).default("blocking"),
});

export type MemoryConfig<T extends "input" | "output"> = T extends "input"
  ? z.input<typeof memoryConfigSchema>
  : z.output<typeof memoryConfigSchema>;

// - Definition
export interface MemoryDefinition {
  name: string;
  config: MemoryConfig<"output">;
  output?: Message[] | ((params: { messages: Message[] }) => Message[] | Promise<Message[]>);
  onHistoryChange?: (params: { messages: Message[] }) => void;
  dependencies: MemoryDependenciesDefinition;
}

// - Builder
export class MemoryDefinitionBuilder<
  const Definition extends MemoryDefinition,
  ExcludedMethods extends string = never,
> {
  _definition: Definition;

  constructor(def: Definition) {
    this._definition = def;
  }

  dependencies<Dependencies extends MemoryDependenciesDefinition>(dependencies: Dependencies) {
    type NewExcludedMethods = ExcludedMethods | "dependencies";
    return new MemoryDefinitionBuilder({
      ...this._definition,
      dependencies: "_definition" in dependencies ? dependencies._definition : dependencies,
    }) as Omit<
      MemoryDefinitionBuilder<Definition & { dependencies: Dependencies }, NewExcludedMethods>,
      NewExcludedMethods
    >;
  }

  config(config: MemoryConfig<"input">) {
    const parsedConfig = memoryConfigSchema.parse(config);
    type NewExcludedMethods = ExcludedMethods | "config";
    return new MemoryDefinitionBuilder({
      ...this._definition,
      config: parsedConfig,
    }) as Omit<
      MemoryDefinitionBuilder<Definition & { config: typeof parsedConfig }, NewExcludedMethods>,
      NewExcludedMethods
    >;
  }

  output(
    // biome-ignore lint/nursery/noShadow: expected here
    params: Message[] | ((params: { messages: Message[] }) => Message[] | Promise<Message[]>),
  ) {
    type NewExcludedMethods = ExcludedMethods | "output";
    return new MemoryDefinitionBuilder({
      ...this._definition,
      output: params,
    }) as Omit<
      MemoryDefinitionBuilder<Definition & { output: typeof params }, NewExcludedMethods>,
      NewExcludedMethods
    >;
  }
  // biome-ignore lint/nursery/noShadow: expected here
  onHistoryChange(params: (params: { messages: Message[] }) => void) {
    type NewExcludedMethods = ExcludedMethods | "onHistoryChange";
    return new MemoryDefinitionBuilder({
      ...this._definition,
      onHistoryChange: params,
    }) as Omit<
      MemoryDefinitionBuilder<Definition & { onHistoryChange: typeof params }, NewExcludedMethods>,
      NewExcludedMethods
    >;
  }
}

export function defineMemory<const Name extends string>(name: Name) {
  return new MemoryDefinitionBuilder({
    name,
    config: memoryConfigSchema.parse({}), // Will default to { behavior: "blocking" }
    dependencies: {
      stores: [],
      collections: [],
    },
  });
}
