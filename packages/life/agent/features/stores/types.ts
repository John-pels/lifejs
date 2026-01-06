import type { Draft } from "immer";
import type { FeatureDependencies } from "@/agent/core/types";

/** Root wrapper: Y.Map stores value under "value" key */
export interface StoreRoot<T> {
  value: T;
}

// Stores
export interface StoreDefinition {
  name: string;
  dependencies: FeatureDependencies;
  value: unknown;
}

export type StoreDefinitions = StoreDefinition[];

export interface StoresOptions {
  noDefaults?: boolean | string[];
}

/**
 * Setter function for Immer-style mutations or full replacement.
 * - Mutation: `(draft) => { draft.x = 1 }` (returns nothing)
 * - Replacement: `(draft) => newValue` (returns new value)
 */
// biome-ignore lint/suspicious/noConfusingVoidType: wanted here
export type StoreSetterFn<Value> = (draft: Draft<Value>) => Value | void;

/**
 * Setter for store values. Accepts either:
 * 1. A setter function (Immer-style): `(draft) => { draft.x = 1 }`
 * 2. A direct value replacement: `newValue`
 */
export type StoreSetter<Value> = Value | StoreSetterFn<Value>;

export interface StoreAccessor<StoreDef extends StoreDefinition> {
  get: () => StoreDef["value"];
  set: (setter: StoreSetter<StoreDef["value"]>) => void;
}

// Observe
export type StoreObserveSelector<Value> = (state: Value) => unknown;

export type StoreObserveCallback<Value> = (newState: Value, oldState: Value) => void;
