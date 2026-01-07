import type { Override, Without } from "@/shared/types";
import {
  defSymbol,
  type PrimitivesDependencies,
  type PrimitivesDependenciesToDefinitions,
} from "../types";
import type { MemoryDefinition, MemoryMessages, MemoryPosition } from "./types";

export const _definition = Symbol("MEMORY_DEFINITION");

export class MemoryBuilder<
  MemoryDef extends MemoryDefinition,
  Excluded extends keyof MemoryBuilder<MemoryDef> = never,
> {
  [defSymbol]: MemoryDef;

  constructor(definition: MemoryDef) {
    this[defSymbol] = definition;
  }

  dependencies<Dependencies extends PrimitivesDependencies>(dependencies: Dependencies) {
    type NewDefinition = Override<
      MemoryDef,
      "dependencies",
      PrimitivesDependenciesToDefinitions<Dependencies>
    >;
    type NewExcluded = Excluded | "dependencies";
    const builder = new MemoryBuilder<NewDefinition, NewExcluded>({
      ...this[defSymbol],
      dependencies,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }

  messages(output: MemoryMessages<MemoryDef["dependencies"]>) {
    type NewExcluded = Excluded | "messages";
    const builder = new MemoryBuilder<MemoryDef, NewExcluded>({
      ...this[defSymbol],
      messages: output,
    } as MemoryDef);
    return builder as Without<typeof builder, NewExcluded>;
  }

  position(position: MemoryPosition) {
    type NewExcluded = Excluded | "position";
    const builder = new MemoryBuilder<MemoryDef, NewExcluded>({
      ...this[defSymbol],
      position,
    } as MemoryDef);
    return builder as Without<typeof builder, NewExcluded>;
  }
}

export const defineMemory = <Name extends string>(name: Name) =>
  new MemoryBuilder({
    name,
    dependencies: [],
    messages: [],
    position: { section: "bottom", align: "end" },
  });
