import type { Dependencies } from "@/agent/core/types";
import type { Override, Without } from "@/shared/types";
import type { MemoryDefinition, MemoryOptions, MemoryOutput } from "./types";

class MemoryBuilder<
  MemoryDef extends MemoryDefinition,
  Excluded extends keyof MemoryBuilder<MemoryDef> = never,
> {
  definition: MemoryDef;
  constructor(definition: MemoryDef) {
    this.definition = definition;
  }
  dependencies<Deps extends Dependencies>(dependencies: Deps) {
    const builder = new MemoryBuilder({ ...this.definition, dependencies });
    type NewDefinition = Override<(typeof builder)["definition"], "dependencies", Deps>;
    const typed = builder as MemoryBuilder<NewDefinition, Excluded | "dependencies">;
    return typed as Without<typeof typed, Excluded | "dependencies">;
  }
  output(output: MemoryOutput<MemoryDef["dependencies"]>) {
    const builder = new MemoryBuilder({ ...this.definition, output });
    const typed = builder as MemoryBuilder<(typeof builder)["definition"], Excluded | "output">;
    return typed as Without<typeof typed, Excluded | "output">;
  }
  options(options: MemoryOptions) {
    const builder = new MemoryBuilder({ ...this.definition, options });
    const typed = builder as MemoryBuilder<(typeof builder)["definition"], Excluded | "options">;
    return typed as Without<typeof typed, Excluded | "options">;
  }
}

export const defineMemory = <Name extends string>(name: Name) =>
  new MemoryBuilder({ name, dependencies: [], output: [], options: {} });
