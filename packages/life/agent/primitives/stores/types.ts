import type { Draft } from "immer";
import type * as Y from "yjs";
import type { EventEmitter } from "@/shared/event-emitter";
import type { emitterDefinition } from "./emitter";

// Root
export interface StoreRoot<T> {
  value: T;
}

// Setter
// biome-ignore lint/suspicious/noConfusingVoidType: needed here
export type StoreSetterFn<Value> = (draft: Draft<Value>) => Value | void;

export type StoreSetter<Value> = Value | StoreSetterFn<Value>;

// Observe
export type StoreObserveSelector<Value> = (state: Value) => unknown;

export type StoreObserveCallback<Value> = (newState: Value, oldState: Value) => void;

// Definition
export interface StoreDefinition {
  name: string;
  value: unknown;
}

// Accessor
export interface StoreAccessor<StoreDef extends StoreDefinition> {
  get: () => Promise<StoreDef["value"]>;
  set: (setter: StoreSetter<StoreDef["value"]>) => Promise<void>;
  observe: (
    selector: StoreObserveSelector<StoreDef["value"]>,
    callback: StoreObserveCallback<StoreDef["value"]>,
  ) => void;
  ydoc: () => Y.Doc;
  on: EventEmitter<typeof emitterDefinition>["on"];
  once: EventEmitter<typeof emitterDefinition>["once"];
}
