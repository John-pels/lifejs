import type { DependenciesAccessors, FeatureDependencies } from "@/agent/core/types";
import type { MaybePromise } from "@/shared/types";

export type EffectOnMount<Deps extends FeatureDependencies = FeatureDependencies> = (
  params: DependenciesAccessors<Deps>,
) => MaybePromise<void | (() => MaybePromise<void>)>;

export type EffectDefinitions = EffectDefinition[];

export interface EffectsOptions {
  noDefaults?: boolean | string[];
}

export interface EffectDefinition {
  name: string;
  dependencies: FeatureDependencies;
  onMount: EffectOnMount;
}
