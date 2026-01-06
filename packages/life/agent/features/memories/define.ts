import type { FeatureDependencies } from "@/agent/core/types";
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

  dependencies<Deps extends FeatureDependencies>(dependencies: Deps) {
    type NewDefinition = Override<MemoryDef, "dependencies", Deps>;
    type NewExcluded = Excluded | "dependencies";
    const builder = new MemoryBuilder<NewDefinition, NewExcluded>({
      ...this.definition,
      dependencies,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }

  output(output: MemoryOutput<MemoryDef["dependencies"]>) {
    type NewExcluded = Excluded | "output";
    const builder = new MemoryBuilder<MemoryDef, NewExcluded>({
      ...this.definition,
      output,
    } as MemoryDef);
    return builder as Without<typeof builder, NewExcluded>;
  }

  options(options: MemoryOptions) {
    type NewExcluded = Excluded | "options";
    const builder = new MemoryBuilder<MemoryDef, NewExcluded>({
      ...this.definition,
      options,
    } as MemoryDef);
    return builder as Without<typeof builder, NewExcluded>;
  }
}

export const defineMemory = <Name extends string>(name: Name) =>
  new MemoryBuilder({ name, dependencies: [], output: [], options: {} });
