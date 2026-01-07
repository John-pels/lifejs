import z from "zod";
import type { Override, Without } from "@/shared/types";
import {
  defSymbol,
  type PrimitivesDependencies,
  type PrimitivesDependenciesToDefinitions,
} from "../types";
import type { ActionDefinition, ActionExecute, ActionOptions } from "./types";

export const _definition = Symbol("ACTION_DEFINITION");

export class ActionBuilder<
  ActionDef extends ActionDefinition,
  Excluded extends keyof ActionBuilder<ActionDef> = never,
> {
  [defSymbol]: ActionDef;

  constructor(definition: ActionDef) {
    this[defSymbol] = definition;
  }

  dependencies<Dependencies extends PrimitivesDependencies>(dependencies: Dependencies) {
    type NewDefinition = Override<
      ActionDef,
      "dependencies",
      PrimitivesDependenciesToDefinitions<Dependencies>
    >;
    type NewExcluded = Excluded | "dependencies";
    const builder = new ActionBuilder<NewDefinition, NewExcluded>({
      ...this[defSymbol],
      dependencies,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }

  description(description: string) {
    type NewExcluded = Excluded | "description";
    const builder = new ActionBuilder<ActionDef, NewExcluded>({
      ...this[defSymbol],
      description,
    } as ActionDef);
    return builder as Without<typeof builder, NewExcluded>;
  }

  input<Schema extends z.ZodObject>(input: Schema) {
    type NewDefinition = Override<ActionDef, "input", Schema>;
    type NewExcluded = Excluded | "input";
    const builder = new ActionBuilder<NewDefinition, NewExcluded>({
      ...this[defSymbol],
      input,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }

  output<Schema extends z.ZodObject>(output: Schema) {
    type NewDefinition = Override<ActionDef, "output", Schema>;
    type NewExcluded = Excluded | "output";
    const builder = new ActionBuilder<NewDefinition, NewExcluded>({
      ...this[defSymbol],
      output,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }

  execute(execute: ActionExecute<ActionDef>) {
    type NewExcluded = Excluded | "execute";
    const builder = new ActionBuilder<ActionDef, NewExcluded>({
      ...this[defSymbol],
      execute,
    } as ActionDef);
    return builder as Without<typeof builder, NewExcluded>;
  }

  options(options: ActionOptions) {
    type NewExcluded = Excluded | "options";
    const builder = new ActionBuilder<ActionDef, NewExcluded>({
      ...this[defSymbol],
      options,
    } as ActionDef);
    return builder as Without<typeof builder, NewExcluded>;
  }
}

export const defineAction = <Name extends string>(name: Name) =>
  new ActionBuilder({
    name,
    dependencies: [],
    description: "",
    input: z.object({}),
    output: z.object({}),
    execute: async () => ({ output: {} }),
    options: {},
  });
