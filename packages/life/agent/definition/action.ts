import z from "zod";
import type { Override, Without } from "@/shared/types";
import type {
  ActionDefinition,
  ActionExecute,
  ActionLabel,
  ActionOptions,
  Dependencies,
} from "../types";

class ActionsBuilder<
  ActionDef extends ActionDefinition,
  Excluded extends keyof ActionsBuilder<ActionDef> = never,
> {
  definition: ActionDef;
  constructor(definition: ActionDef) {
    this.definition = definition;
  }
  dependencies<Deps extends Dependencies>(dependencies: Deps) {
    const builder = new ActionsBuilder({ ...this.definition, dependencies });
    type NewDefinition = Override<(typeof builder)["definition"], "dependencies", Deps>;
    const typed = builder as ActionsBuilder<NewDefinition, Excluded | "dependencies">;
    return typed as Without<typeof typed, Excluded | "dependencies">;
  }
  description(description: string) {
    const builder = new ActionsBuilder({ ...this.definition, description });
    const typed = builder as ActionsBuilder<ActionDef, Excluded | "description">;
    return typed as Without<typeof typed, Excluded | "description">;
  }
  input<Schema extends z.ZodObject>(input: Schema) {
    const builder = new ActionsBuilder({ ...this.definition, inputSchema: input });
    type NewDefinition = Override<(typeof builder)["definition"], "input", Schema>;
    const typed = builder as ActionsBuilder<NewDefinition, Excluded | "input">;
    return typed as Without<typeof typed, Excluded | "input">;
  }
  output<Schema extends z.ZodObject>(output: Schema) {
    const builder = new ActionsBuilder({ ...this.definition, outputSchema: output });
    type NewDefinition = Override<(typeof builder)["definition"], "output", Schema>;
    const typed = builder as ActionsBuilder<NewDefinition, Excluded | "output">;
    return typed as Without<typeof typed, Excluded | "output">;
  }
  label(label: ActionLabel<ActionDef>) {
    const builder = new ActionsBuilder({ ...this.definition, label });
    const typed = builder as ActionsBuilder<ActionDef, Excluded | "label">;
    return typed as Without<typeof typed, Excluded | "label">;
  }
  execute(execute: ActionExecute<ActionDef>) {
    const builder = new ActionsBuilder({ ...this.definition, execute });
    const typed = builder as ActionsBuilder<(typeof builder)["definition"], Excluded | "execute">;
    return typed as Without<typeof typed, Excluded | "execute">;
  }
  options(options: ActionOptions) {
    const builder = new ActionsBuilder({ ...this.definition, options });
    const typed = builder as ActionsBuilder<(typeof builder)["definition"], Excluded | "options">;
    return typed as Without<typeof typed, Excluded | "options">;
  }
}

export const defineAction = <Name extends string>(name: Name) =>
  new ActionsBuilder({
    name,
    dependencies: [],
    description: "",
    input: z.object({}),
    outputSchema: z.object({}),
    execute: async () => ({ output: {} }),
    options: {},
    label: name,
  });
