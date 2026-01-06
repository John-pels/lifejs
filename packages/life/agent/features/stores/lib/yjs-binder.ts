/**
 * YJS Binder
 *
 * Inspired by the `immer-yjs` package (https://github.com/sep2/immer-yjs).
 *
 * Provides an Immer-like interface for manipulating nested Yjs documents:
 * - `get()` returns the current snapshot as a plain JS object
 * - `update((draft) => { ... })` applies mutations via Immer patches → surgical Yjs updates
 * - `subscribe()` notifies on changes with structural sharing
 *
 * Supports `@/shared/canon` serialization for special types (Date, BigInt, Set, Map, Error, etc.)
 * that Yjs doesn't natively handle. Leaf values are automatically serialized/deserialized.
 */

import { enablePatches, type Patch, produce, produceWithPatches, type WritableDraft } from "immer";
import * as Y from "yjs";
import { canon, type SerializableValue, type SerializeResult } from "@/shared/canon";
import type { StoreRoot } from "../types";

enablePatches();

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type UpdateFn<T> = (draft: WritableDraft<StoreRoot<T>>) => void;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && v.constructor === Object;
}

// ─────────────────────────────────────────────────────────────────────────────
// Serialization
// ─────────────────────────────────────────────────────────────────────────────

const SERIALIZED_MARKER = "__serialized__";

type SerializedValue = { [SERIALIZED_MARKER]: true } & SerializeResult;

function isSerializedValue(v: unknown): v is SerializedValue {
  return isPlainObject(v) && SERIALIZED_MARKER in v && v[SERIALIZED_MARKER] === true;
}

function serializeValue(v: unknown): SerializedValue {
  const [err, serialized] = canon.serialize(v as SerializableValue);
  if (err) throw err;
  return { [SERIALIZED_MARKER]: true, ...serialized };
}

function deserializeValue(v: unknown): unknown {
  if (isSerializedValue(v)) {
    const [err, value] = canon.deserialize(v);
    if (err) throw err;
    return value;
  }
  if (Array.isArray(v)) return v.map(deserializeValue);
  if (isPlainObject(v)) {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(v)) result[key] = deserializeValue(val);
    return result;
  }
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Plain JS ⟺ Yjs
// ─────────────────────────────────────────────────────────────────────────────

function toYjs(value: unknown): unknown {
  // Array → Y.Array
  if (Array.isArray(value)) {
    const arr = new Y.Array();
    arr.push(value.map(toYjs));
    return arr;
  }
  // Plain object → Y.Map
  if (isPlainObject(value)) {
    const map = new Y.Map();
    for (const [k, v] of Object.entries(value)) map.set(k, toYjs(v));
    return map;
  }
  // Serialize leaf values
  return serializeValue(value);
}

function fromYjs(v: unknown): unknown {
  // Y.Map → Plain object
  if (v instanceof Y.Map) {
    const obj: Record<string, unknown> = {};
    for (const [key, val] of v.entries()) obj[key] = fromYjs(val);
    return obj;
  }
  // Y.Array → Array
  if (v instanceof Y.Array) return v.toArray().map(fromYjs);
  // Y.Text → string
  if (v instanceof Y.Text) return v.toString();
  // Deserialized leaf values
  if (isSerializedValue(v)) return deserializeValue(v);
  return v;
}

// ─────────────────────────────────────────────────────────────────────────────
// Yjs Events → Snapshot (with structural sharing via Immer)
// ─────────────────────────────────────────────────────────────────────────────

function applyYEvent(base: unknown, event: Y.YEvent<Y.Map<unknown> | Y.Array<unknown>>) {
  if (event instanceof Y.YMapEvent && isPlainObject(base)) {
    const source = event.target;
    event.changes.keys.forEach((change, key) => {
      if (change.action === "delete") delete base[key];
      else base[key] = fromYjs(source.get(key));
    });
    return;
  }
  if (event instanceof Y.YArrayEvent && Array.isArray(base)) {
    let idx = 0;
    for (const delta of event.changes.delta) {
      if (delta.retain) idx += delta.retain;
      if (delta.delete) base.splice(idx, delta.delete);
      if (delta.insert && Array.isArray(delta.insert)) {
        const items = delta.insert.map(fromYjs);
        base.splice(idx, 0, ...items);
        idx += items.length;
      }
    }
  }
}

function applyYEvents<S extends StoreRoot<unknown>>(
  snapshot: S,
  events: Y.YEvent<Y.Map<unknown> | Y.Array<unknown>>[],
): S {
  return produce(snapshot, (draft: S) => {
    for (const event of events) {
      let base: unknown = draft;
      for (const step of event.path) {
        if (isPlainObject(base) && typeof step === "string") base = base[step];
        else if (Array.isArray(base) && typeof step === "number") base = base[step];
      }
      applyYEvent(base, event);
    }
  }) as S;
}

// ─────────────────────────────────────────────────────────────────────────────
// Immer Patches → Yjs (surgical updates)
// ─────────────────────────────────────────────────────────────────────────────

function applyPatch(target: Y.Map<unknown> | Y.Array<unknown>, patch: Patch) {
  const { path, op, value } = patch;

  // Root-level replace
  if (path.length === 0) {
    if (op !== "replace") throw new Error(`Unsupported root operation: ${op}`);
    if (target instanceof Y.Map && isPlainObject(value)) {
      target.clear();
      for (const [k, v] of Object.entries(value)) target.set(k, toYjs(v));
    } else if (target instanceof Y.Array && Array.isArray(value)) {
      target.delete(0, target.length);
      target.push(value.map(toYjs));
    }
    return;
  }

  // Navigate to parent
  let base: Y.Map<unknown> | Y.Array<unknown> = target;
  for (let i = 0; i < path.length - 1; i++) {
    base = base.get(path[i] as never) as Y.Map<unknown> | Y.Array<unknown>;
  }

  const prop = path.at(-1);

  if (base instanceof Y.Map && typeof prop === "string") {
    if (op === "remove") base.delete(prop);
    else base.set(prop, toYjs(value));
    return;
  }
  if (base instanceof Y.Array && typeof prop === "number") {
    if (op === "add") base.insert(prop, [toYjs(value)]);
    else if (op === "replace") {
      base.delete(prop);
      base.insert(prop, [toYjs(value)]);
    } else if (op === "remove") base.delete(prop);
    return;
  }
  if (
    base instanceof Y.Array &&
    prop === "length" &&
    typeof value === "number" &&
    value < base.length
  ) {
    base.delete(value, base.length - value);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface YjsBinder<T> {
  get: () => StoreRoot<T>;
  update: (fn: UpdateFn<T>, origin?: unknown) => void;
  subscribe: (fn: (snapshot: StoreRoot<T>) => void) => () => void;
  unbind: () => void;
}

export function bindYjs<T>(source: Y.Map<unknown>): YjsBinder<T> {
  // Initial snapshot: toJSON + deserialize canon markers
  let snapshot = deserializeValue(source.toJSON()) as StoreRoot<T>;

  const subscribers = new Set<(snapshot: StoreRoot<T>) => void>();

  const observer = (events: Y.YEvent<Y.Map<unknown> | Y.Array<unknown>>[]) => {
    snapshot = applyYEvents(snapshot, events) as StoreRoot<T>;
    for (const fn of subscribers) fn(snapshot);
  };

  source.observeDeep(observer);

  return {
    get: () => snapshot,

    update: (fn, origin) => {
      const [, patches] = produceWithPatches(snapshot, fn);
      const apply = () => {
        for (const patch of patches) applyPatch(source, patch);
      };
      if (source.doc) Y.transact(source.doc, apply, origin);
      else apply();
    },

    subscribe: (fn) => {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },

    unbind: () => {
      source.unobserveDeep(observer);
      subscribers.clear();
    },
  };
}
