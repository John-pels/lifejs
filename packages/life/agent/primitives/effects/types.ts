import type { LifeError } from "@/shared/error";
import type { EventEmitter } from "@/shared/event-emitter";
import type { MaybePromise } from "@/shared/types";
import type { PrimitiveAccessors, PrimitiveDefinitions } from "../types";
import type { emitterDefinition } from "./emitter";

// Setup
export type EffectSetup<Dependencies extends PrimitiveDefinitions = PrimitiveDefinitions> = (
  params: PrimitiveAccessors<Dependencies>,
) => MaybePromise<void | (() => MaybePromise<void>)>;

// Definition
export interface EffectDefinition {
  name: string;
  dependencies: PrimitiveDefinitions;
  setup: EffectSetup;
}

// Accessor
export interface EffectAccessor {
  name: string;
  hasMounted: () => Promise<boolean>;
  hasUnmounted: () => Promise<boolean>;
  mountedInMs: () => Promise<number>;
  unmountedInMs: () => Promise<number>;
  mountError: () => Promise<LifeError | undefined>;
  unmountError: () => Promise<LifeError | undefined>;
  on: EventEmitter<typeof emitterDefinition>["on"];
  once: EventEmitter<typeof emitterDefinition>["once"];
}
