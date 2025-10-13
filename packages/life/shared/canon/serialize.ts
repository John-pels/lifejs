import { deserializeError, isErrorLike, serializeError } from "serialize-error";
import superjson, { type SuperJSONResult } from "superjson";
import { ZodError, z } from "zod";
import * as op from "@/shared/operation";
import { isLifeError, type LifeErrorUnion, lifeErrorFromObject, lifeErrorToObject } from "../error";

// Register custom transformer for LifeError objects
// biome-ignore lint/suspicious/noExplicitAny: Record<string, unknown> is serializable
superjson.registerCustom<LifeErrorUnion, any>(
  {
    isApplicable: (v): v is LifeErrorUnion => isLifeError(v),
    // Using superjson.serialize ensures that 'err.cause' gets serialized properly
    serialize: (err) => superjson.serialize(lifeErrorToObject(err)),
    deserialize: (data) => lifeErrorFromObject(superjson.deserialize(data)),
  },
  "LifeError",
);

// Register custom transformer for ZodError to preserve all error information
// We use unknown[] as the serialized type since ZodIssue has complex union types
// that don't satisfy SuperJSON's JSONValue constraints
// biome-ignore lint/suspicious/noExplicitAny: z.ZodIssue[] is not a valid JSONValue, but is serializable
superjson.registerCustom<ZodError, any>(
  {
    isApplicable: (v): v is ZodError => v instanceof ZodError,
    serialize: (err) => err.issues,
    deserialize: (data) => new ZodError(data as z.core.$ZodIssue[]),
  },
  "ZodError",
);

// Register custom transformer for general Error objects using serialize-error
// This runs after ZodError transformer, so ZodError takes precedence
// biome-ignore lint/suspicious/noExplicitAny: serialize-error output is complex but serializable
superjson.registerCustom<Error, any>(
  {
    isApplicable: (v): v is Error => isErrorLike(v),
    serialize: (err) => serializeError(err),
    deserialize: (data) => deserializeError(data),
  },
  "Error",
);

// Register custom transformer OperationResult tuples
// biome-ignore lint/suspicious/noExplicitAny: serialize-error output is complex but serializable
superjson.registerCustom<op.OperationResult<unknown>, any>(
  {
    isApplicable: (v): v is op.OperationResult<unknown> => op.isResult(v),
    serialize: (result) => op.serializeResult(result),
    deserialize: (data) => op.deserializeResult(data),
  },
  "OperationResult",
);

// - Primitive types
const serializablePrimitivesSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.undefined(),
  z.bigint(),
  z.date(),
  z.instanceof(RegExp),
  z.instanceof(Error),
  z.instanceof(URL),
  z.instanceof(ArrayBuffer),
  z.instanceof(Int8Array),
  z.instanceof(Uint8Array),
  z.instanceof(Uint8ClampedArray),
  z.instanceof(Int16Array),
  z.instanceof(Uint16Array),
  z.instanceof(Int32Array),
  z.instanceof(Uint32Array),
  z.instanceof(Float32Array),
  z.instanceof(Float64Array),
  z.instanceof(BigInt64Array),
  z.instanceof(BigUint64Array),
]);
type SerializablePrimitives = z.infer<typeof serializablePrimitivesSchema>;

// Collections and recursive types
export const serializableValueSchema: z.ZodType<SerializableValue> = z.lazy(() =>
  z.union([
    serializablePrimitivesSchema,
    z.array(serializableValueSchema),
    z.set(serializableValueSchema),
    z.map(z.any(), serializableValueSchema),
    z.record(z.string(), serializableValueSchema),
  ]),
);
export type SerializableValue =
  | SerializablePrimitives
  | SerializableValue[]
  | readonly SerializableValue[]
  | [SerializableValue, ...SerializableValue[]]
  | readonly [SerializableValue, ...SerializableValue[]]
  | Set<SerializableValue>
  | Map<SerializableValue, SerializableValue>
  | { [key: string]: SerializableValue };

export type SerializeResult = SuperJSONResult;

/**
 * canon.serialize
 *
 * Converts any supported runtime value into the transport-friendly structure
 * that `canon` uses internally (built on top of SuperJSON). This step preserves
 * richer JavaScript types (Date, Map, Set, BigInt, RegExp, undefined, NaN,
 * Infinity, etc.) without yet enforcing key/element ordering—that canonical
 * normalization happens later in `canon.stringify`.
 *
 * Typical use cases:
 * - Store the result as JSON: `JSON.stringify(canon.serialize(v))`
 * - Send across the wire and rehydrate with `canon.deserialize`
 *
 * @param value - The value to encode into the canon/SuperJSON wire format.
 * @returns A plain JSON-safe object describing the value and its metadata.
 *
 * @example
 * ```ts
 * import { canon } from "@shared/canon";
 *
 * const encoded = canon.serialize(new Map([["a", 1]]));
 * // → { json: {...}, meta: {...} }
 *
 * // Safe to stringify:
 * const payload = JSON.stringify(encoded);
 * ```
 */
export const serialize = (value: SerializableValue | unknown) =>
  op.attempt(() => superjson.serialize(value));

/**
 * canon.deserialize
 *
 * Reconstructs a runtime value from a `SerializeResult` previously produced by
 * `canon.serialize`. All special types preserved during serialization are
 * restored (Date, Map, Set, BigInt, RegExp, etc.).
 *
 * @param value - The structured payload (usually parsed from JSON) to turn back into a live value.
 * @returns The fully rehydrated value.
 *
 * @example
 * ```ts
 * import { canon } from "@shared/canon";
 *
 * const encoded = canon.serialize(new Set([1, 2, 3]));
 * const roundTripped = canon.deserialize(encoded); // → Set {1, 2, 3}
 *
 * // When transmitting:
 * const wire = JSON.stringify(encoded);
 * const decoded = canon.deserialize(JSON.parse(wire));
 * ```
 */
export const deserialize = (
  value?: SerializeResult,
): op.OperationResult<SerializableValue | undefined> => {
  if (!value) return op.success(value);
  return op.attempt(() => superjson.deserialize(value));
};
