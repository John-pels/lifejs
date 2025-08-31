import { z } from "zod";
import type { serializableValueSchema } from "@/shared/canon";

// - Config
const commonStoreConfigSchema = z.object({
  schema: z.custom<
    | z.ZodRecord<z.ZodString, typeof serializableValueSchema>
    | z.ZodArray<typeof serializableValueSchema>
  >((val) => {
    if (val instanceof z.ZodArray || val instanceof z.ZodRecord) return true;
    return false;
  }),
});

export const controlledStoreConfigSchema = commonStoreConfigSchema.extend({
  type: z.literal("controlled"),

  ttl: z.number().optional(),
});

export const freeformStoreConfigSchema = commonStoreConfigSchema.extend({
  type: z.literal("freeform"),
});

export const storeConfigSchema = z.union([controlledStoreConfigSchema, freeformStoreConfigSchema]);

export type StoreConfig<T extends "input" | "output"> = T extends "input"
  ? z.input<typeof storeConfigSchema>
  : z.output<typeof storeConfigSchema>;

// - Retrieve
export type StoreRetrieve<Config extends StoreConfig<"output">> = () =>
  | z.infer<Config["schema"]>
  | Promise<z.infer<Config["schema"]>>;

// - Definition
export interface StoreDefinition {
  name: string;
  config: StoreConfig<"output">;
  retrieve?: () => unknown | Promise<unknown>;
}

// Builder class
export class StoreDefinitionBuilder<
  const Definition extends StoreDefinition,
  ExcludedMethods extends string = never,
> {
  _definition: Definition;

  constructor(def: Definition) {
    this._definition = def;
  }

  config<Config extends StoreConfig<"input">>(config: Config) {
    const parsedConfig = storeConfigSchema.parse(config);
    type NewExcludedMethods =
      | ExcludedMethods
      | "config"
      | (Config["type"] extends "controlled" ? never : "retrieve");
    return new StoreDefinitionBuilder({
      ...this._definition,
      config: parsedConfig,
    }) as Omit<
      StoreDefinitionBuilder<Definition & { config: Config }, NewExcludedMethods>,
      NewExcludedMethods
    >;
  }

  retrieve(retrieve: StoreRetrieve<Definition["config"]>) {
    type NewExcludedMethods = ExcludedMethods | "retrieve";
    return new StoreDefinitionBuilder({
      ...this._definition,
      retrieve,
    }) as Omit<
      StoreDefinitionBuilder<
        Definition & { retrieve: StoreRetrieve<Definition["config"]> },
        NewExcludedMethods
      >,
      NewExcludedMethods
    >;
  }
}

export function defineStore<const Name extends string>(name: Name) {
  return new StoreDefinitionBuilder({ name, config: storeConfigSchema.parse({}) });
}

// const store = defineStore("store")
//   .config({
//     type: "controlled",
//     schema: z.object({
//       name: z.string(),
//     }),
//     ttl: 1000,
//   })
//   .retrieve(() => {
//     return { name: "test" };
//   });
