import type { FeatureDependencies } from "@/agent/core/types";
import type { Override, WidenLiterals, Without } from "@/shared/types";
import type { StoreDefinition } from "./types";
import { SerializableValue } from "@/shared/canon";


class StoreBuilder<
  StoreDef extends StoreDefinition,
  Excluded extends keyof StoreBuilder<StoreDef> = never,
> {
  definition: StoreDef;

  constructor(definition: StoreDef) {
    this.definition = definition;
  }

  dependencies<Dependencies extends FeatureDependencies>(dependencies: Dependencies) {
    type NewDefinition = Override<StoreDef, "dependencies", Dependencies>;
    type NewExcluded = Excluded | "dependencies";
    const builder = new StoreBuilder<NewDefinition, NewExcluded>({
      ...this.definition,
      dependencies,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }

  value<Value extends SerializableValue>(value: Value) {
    type NewDefinition = Override<StoreDef, "value", WidenLiterals<Value>>;
    type NewExcluded = Excluded | "value";
    const builder = new StoreBuilder<NewDefinition, NewExcluded>({
      ...this.definition,
      value,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }
}

export const defineStore = <Name extends string>(name: Name) =>
  new StoreBuilder({ name, dependencies: [], value: undefined });
