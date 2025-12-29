import type { Override, Without } from "@/shared/types";
import type { Dependencies, EffectDefinition, EffectOnMount, EffectOptions } from "../types";

class EffectsBuilder<
  EffectDef extends EffectDefinition,
  Excluded extends keyof EffectsBuilder<EffectDef> = never,
> {
  definition: EffectDef;
  constructor(definition: EffectDef) {
    this.definition = definition;
  }
  dependencies<Deps extends Dependencies>(dependencies: Deps) {
    const builder = new EffectsBuilder({ ...this.definition, dependencies });
    type NewDefinition = Override<(typeof builder)["definition"], "dependencies", Deps>;
    const typed = builder as EffectsBuilder<NewDefinition, Excluded | "dependencies">;
    return typed as Without<typeof typed, Excluded | "dependencies">;
  }
  onMount(onMount: EffectOnMount<EffectDef["dependencies"]>) {
    const builder = new EffectsBuilder({ ...this.definition, onMount });
    type NewDefinition = Override<
      (typeof builder)["definition"],
      "onMount",
      EffectOnMount<EffectDef["dependencies"]>
    >;
    const typed = builder as EffectsBuilder<NewDefinition, Excluded | "onMount">;
    return typed as Without<typeof typed, Excluded | "onMount">;
  }
  options(options: EffectOptions) {
    const builder = new EffectsBuilder({ ...this.definition, options });
    const typed = builder as EffectsBuilder<(typeof builder)["definition"], Excluded | "options">;
    return typed as Without<typeof typed, Excluded | "options">;
  }
}

export const defineEffect = <Name extends string>(name: Name) =>
  new EffectsBuilder({ name, dependencies: [], onMount: async () => void 0, options: {} });
