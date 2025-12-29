import z from "zod";
import type { Override, Without } from "@/shared/types";
import type { Dependencies, StoreDefinition, StoreOptions } from "../types";

class StoresBuilder<
  StoreDef extends StoreDefinition,
  Excluded extends keyof StoresBuilder<StoreDef> = never,
> {
  definition: StoreDef;
  constructor(definition: StoreDef) {
    this.definition = definition;
  }
  dependencies<Deps extends Dependencies>(dependencies: Deps) {
    const builder = new StoresBuilder({ ...this.definition, dependencies });
    type NewDefinition = Override<(typeof builder)["definition"], "dependencies", Deps>;
    const typed = builder as StoresBuilder<NewDefinition, Excluded | "dependencies">;
    return typed as Without<typeof typed, Excluded | "dependencies">;
  }
  schema<Schema extends z.ZodObject>(schema: Schema) {
    const builder = new StoresBuilder({ ...this.definition, schema });
    type NewDefinition = Override<(typeof builder)["definition"], "schema", Schema>;
    const typed = builder as StoresBuilder<NewDefinition, Excluded | "schema">;
    return typed as Without<typeof typed, Excluded | "schema">;
  }
  options(options: StoreOptions) {
    const builder = new StoresBuilder({ ...this.definition, options });
    const typed = builder as StoresBuilder<(typeof builder)["definition"], Excluded | "options">;
    return typed as Without<typeof typed, Excluded | "options">;
  }
}

export const defineStore = <Name extends string>(name: Name) =>
  new StoresBuilder({ name, dependencies: [], schema: z.object({}), options: {} });
