import type { Dependencies, DependenciesAccessors } from "@/agent/core/types";
import type { MaybePromise } from "@/shared/types";

export interface EffectOptions {
  disabled?: boolean;
}

export type EffectOnMount<Deps extends Dependencies = Dependencies> = (
  params: DependenciesAccessors<Deps>,
) => MaybePromise<void | (() => MaybePromise<void>)>;

export type EffectDefinitions = EffectDefinition[];

export interface EffectsOptions {
  noDefaults?: boolean | string[];
}

export interface EffectDefinition {
  name: string;
  dependencies: Dependencies;
  onMount: EffectOnMount;
  options: EffectOptions;
}
