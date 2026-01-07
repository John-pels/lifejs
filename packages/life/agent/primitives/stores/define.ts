import type { SerializableValue } from "@/shared/canon";
import type { Override, WidenLiterals, Without } from "@/shared/types";
import { defSymbol } from "../types";
import type { StoreDefinition } from "./types";

class StoreBuilder<
  StoreDef extends StoreDefinition,
  Excluded extends keyof StoreBuilder<StoreDef> = never,
> {
  [defSymbol]: StoreDef;

  constructor(definition: StoreDef) {
    this[defSymbol] = definition;
  }

  value<Value extends SerializableValue>(value: Value) {
    type NewDefinition = Override<StoreDef, "value", WidenLiterals<Value>>;
    type NewExcluded = Excluded | "value";
    const builder = new StoreBuilder<NewDefinition, NewExcluded>({
      ...this[defSymbol],
      value,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }
}

export const defineStore = <Name extends string>(name: Name) =>
  new StoreBuilder({ name, value: undefined });
