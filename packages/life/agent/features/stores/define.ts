import z from "zod";
import type { Dependencies } from "@/agent/core/types";
import type { Override, Without } from "@/shared/types";
import type { StoreDefinition, StoreOptions } from "./types";

class StoreBuilder<
  StoreDef extends StoreDefinition,
  Excluded extends keyof StoreBuilder<StoreDef> = never,
> {
  definition: StoreDef;
  constructor(definition: StoreDef) {
    this.definition = definition;
  }
  dependencies<Deps extends Dependencies>(dependencies: Deps) {
    const builder = new StoreBuilder({ ...this.definition, dependencies });
    type NewDefinition = Override<(typeof builder)["definition"], "dependencies", Deps>;
    const typed = builder as StoreBuilder<NewDefinition, Excluded | "dependencies">;
    return typed as Without<typeof typed, Excluded | "dependencies">;
  }
  schema<Schema extends z.ZodObject>(schema: Schema) {
    const builder = new StoreBuilder({ ...this.definition, schema });
    type NewDefinition = Override<(typeof builder)["definition"], "schema", Schema>;
    const typed = builder as StoreBuilder<NewDefinition, Excluded | "schema">;
    return typed as Without<typeof typed, Excluded | "schema">;
  }
  options(options: StoreOptions) {
    const builder = new StoreBuilder({ ...this.definition, options });
    const typed = builder as StoreBuilder<(typeof builder)["definition"], Excluded | "options">;
    return typed as Without<typeof typed, Excluded | "options">;
  }
}

export const defineStore = <Name extends string>(name: Name) =>
  new StoreBuilder({ name, dependencies: [], schema: z.object({}), options: {} });
