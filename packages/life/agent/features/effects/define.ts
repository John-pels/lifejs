import type { FeatureDependencies } from "@/agent/core/types";
import type { Override, Without } from "@/shared/types";
import type { EffectDefinition, EffectOnMount } from "./types";

class EffectBuilder<
  EffectDef extends EffectDefinition,
  Excluded extends keyof EffectBuilder<EffectDef> = never,
> {
  definition: EffectDef;

  constructor(definition: EffectDef) {
    this.definition = definition;
  }

  dependencies<Deps extends FeatureDependencies>(dependencies: Deps) {
    type NewDefinition = Override<EffectDef, "dependencies", Deps>;
    type NewExcluded = Excluded | "dependencies";
    const builder = new EffectBuilder<NewDefinition, NewExcluded>({
      ...this.definition,
      dependencies,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }

  onMount(onMount: EffectOnMount<EffectDef["dependencies"]>) {
    type NewDefinition = Override<EffectDef, "onMount", EffectOnMount<EffectDef["dependencies"]>>;
    type NewExcluded = Excluded | "onMount";
    const builder = new EffectBuilder<NewDefinition, NewExcluded>({
      ...this.definition,
      onMount,
    } as NewDefinition);
    return builder as Without<typeof builder, NewExcluded>;
  }
}

export const defineEffect = <Name extends string>(name: Name) =>
  new EffectBuilder({ name, dependencies: [], onMount: async () => void 0, options: {} });
