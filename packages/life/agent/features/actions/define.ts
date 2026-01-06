import z from "zod";
import type { FeatureDependencies } from "@/agent/core/types";
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

  dependencies<Deps extends FeatureDependencies>(dependencies: Deps) {
    type NewDefinition = Override<ActionDef, "dependencies", Deps>;
    type NewExcluded = Excluded | "dependencies";
    const builder = new ActionBuilder<NewDefinition, NewExcluded>({
      ...this.definition,
      dependencies,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }

  description(description: string) {
    type NewExcluded = Excluded | "description";
    const builder = new ActionBuilder<ActionDef, NewExcluded>({
      ...this.definition,
      description,
    } as ActionDef);
    return builder as Without<typeof builder, NewExcluded>;
  }

  input<Schema extends z.ZodObject>(input: Schema) {
    type NewDefinition = Override<ActionDef, "inputSchema", Schema>;
    type NewExcluded = Excluded | "input";
    const builder = new ActionBuilder<NewDefinition, NewExcluded>({
      ...this.definition,
      inputSchema: input,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }

  output<Schema extends z.ZodObject>(output: Schema) {
    type NewDefinition = Override<ActionDef, "outputSchema", Schema>;
    type NewExcluded = Excluded | "output";
    const builder = new ActionBuilder<NewDefinition, NewExcluded>({
      ...this.definition,
      outputSchema: output,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }

  label(label: ActionLabel<ActionDef>) {
    type NewExcluded = Excluded | "label";
    const builder = new ActionBuilder<ActionDef, NewExcluded>({
      ...this.definition,
      label,
    } as ActionDef);
    return builder as Without<typeof builder, NewExcluded>;
  }

  execute(execute: ActionExecute<ActionDef>) {
    type NewExcluded = Excluded | "execute";
    const builder = new ActionBuilder<ActionDef, NewExcluded>({
      ...this.definition,
      execute,
    } as ActionDef);
    return builder as Without<typeof builder, NewExcluded>;
  }

  options(options: ActionOptions) {
    type NewExcluded = Excluded | "options";
    const builder = new ActionBuilder<ActionDef, NewExcluded>({
      ...this.definition,
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
    inputSchema: z.object({}),
    outputSchema: z.object({}),
    execute: async () => ({ output: {} }),
    options: {},
    label: name,
  });
