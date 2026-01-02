import type { Dependencies } from "@/agent/core/types";
import type { Override, Without } from "@/shared/types";
import type { EffectDefinition, EffectOnMount, EffectOptions } from "./types";

class EffectBuilder<
  EffectDef extends EffectDefinition,
  Excluded extends keyof EffectBuilder<EffectDef> = never,
> {
  definition: EffectDef;
  constructor(definition: EffectDef) {
    this.definition = definition;
  }

  dependencies<Deps extends Dependencies>(dependencies: Deps) {
    const builder = new EffectBuilder({ ...this.definition, dependencies });
    type NewDefinition = Override<(typeof builder)["definition"], "dependencies", Deps>;
    const typed = builder as EffectBuilder<NewDefinition, Excluded | "dependencies">;
    return typed as Without<typeof typed, Excluded | "dependencies">;
  }

  onMount(onMount: EffectOnMount<EffectDef["dependencies"]>) {
    const builder = new EffectBuilder({ ...this.definition, onMount });
    type NewDefinition = Override<
      (typeof builder)["definition"],
      "onMount",
      EffectOnMount<EffectDef["dependencies"]>
    >;
    const typed = builder as EffectBuilder<NewDefinition, Excluded | "onMount">;
    return typed as Without<typeof typed, Excluded | "onMount">;
  }

  options(options: EffectOptions) {
    const builder = new EffectBuilder({ ...this.definition, options });
    const typed = builder as EffectBuilder<(typeof builder)["definition"], Excluded | "options">;
    return typed as Without<typeof typed, Excluded | "options">;
  }
}

export const defineEffect = <Name extends string>(name: Name) =>
  new EffectBuilder({ name, dependencies: [], onMount: async () => void 0, options: {} });
