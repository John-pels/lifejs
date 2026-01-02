import z from "zod";
import type { Dependencies } from "@/agent/core/types";
import type { Override, Without } from "@/shared/types";
import type { ActionDefinition, ActionExecute, ActionLabel, ActionOptions } from "./types";

class ActionBuilder<
  ActionDef extends ActionDefinition,
  Excluded extends keyof ActionBuilder<ActionDef> = never,
> {
  definition: ActionDef;
  constructor(definition: ActionDef) {
    this.definition = definition;
  }
  dependencies<Deps extends Dependencies>(dependencies: Deps) {
    const builder = new ActionBuilder({ ...this.definition, dependencies });
    type NewDefinition = Override<(typeof builder)["definition"], "dependencies", Deps>;
    const typed = builder as ActionBuilder<NewDefinition, Excluded | "dependencies">;
    return typed as Without<typeof typed, Excluded | "dependencies">;
  }
  description(description: string) {
    const builder = new ActionBuilder({ ...this.definition, description });
    const typed = builder as ActionBuilder<ActionDef, Excluded | "description">;
    return typed as Without<typeof typed, Excluded | "description">;
  }
  input<Schema extends z.ZodObject>(input: Schema) {
    const builder = new ActionBuilder({ ...this.definition, inputSchema: input });
    type NewDefinition = Override<(typeof builder)["definition"], "input", Schema>;
    const typed = builder as ActionBuilder<NewDefinition, Excluded | "input">;
    return typed as Without<typeof typed, Excluded | "input">;
  }
  output<Schema extends z.ZodObject>(output: Schema) {
    const builder = new ActionBuilder({ ...this.definition, outputSchema: output });
    type NewDefinition = Override<(typeof builder)["definition"], "output", Schema>;
    const typed = builder as ActionBuilder<NewDefinition, Excluded | "output">;
    return typed as Without<typeof typed, Excluded | "output">;
  }
  label(label: ActionLabel<ActionDef>) {
    const builder = new ActionBuilder({ ...this.definition, label });
    const typed = builder as ActionBuilder<ActionDef, Excluded | "label">;
    return typed as Without<typeof typed, Excluded | "label">;
  }
  execute(execute: ActionExecute<ActionDef>) {
    const builder = new ActionBuilder({ ...this.definition, execute });
    const typed = builder as ActionBuilder<(typeof builder)["definition"], Excluded | "execute">;
    return typed as Without<typeof typed, Excluded | "execute">;
  }
  options(options: ActionOptions) {
    const builder = new ActionBuilder({ ...this.definition, options });
    const typed = builder as ActionBuilder<(typeof builder)["definition"], Excluded | "options">;
    return typed as Without<typeof typed, Excluded | "options">;
  }
}

export const defineAction = <Name extends string>(name: Name) =>
  new ActionBuilder({
    name,
    dependencies: [],
    description: "",
    input: z.object({}),
    outputSchema: z.object({}),
    execute: async () => ({ output: {} }),
    options: {},
    label: name,
  });
