import type { Override, Without } from "@/shared/types";
import {
  defSymbol,
  type PrimitivesDependencies,
  type PrimitivesDependenciesToDefinitions,
} from "../types";
import type { EffectDefinition, EffectSetup } from "./types";

export const _definition = Symbol("EFFECT_DEFINITION");

export class EffectBuilder<
  EffectDef extends EffectDefinition,
  Excluded extends keyof EffectBuilder<EffectDef> = never,
> {
  [defSymbol]: EffectDef;

  constructor(definition: EffectDef) {
    this[defSymbol] = definition;
  }

  dependencies<Dependencies extends PrimitivesDependencies>(dependencies: Dependencies) {
    type NewDefinition = Override<
      EffectDef,
      "dependencies",
      PrimitivesDependenciesToDefinitions<Dependencies>
    >;
    type NewExcluded = Excluded | "dependencies";
    const builder = new EffectBuilder<NewDefinition, NewExcluded>({
      ...this[defSymbol],
      dependencies,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }

  setup(setup: EffectSetup<EffectDef["dependencies"]>) {
    type NewDefinition = Override<EffectDef, "setup", EffectSetup<EffectDef["dependencies"]>>;
    type NewExcluded = Excluded | "setup";
    const builder = new EffectBuilder<NewDefinition, NewExcluded>({
      ...this[defSymbol],
      setup,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }
}

export const defineEffect = <Name extends string>(name: Name) =>
  new EffectBuilder({ name, dependencies: [], setup: async () => void 0, options: {} });
