import z from "zod";
import * as op from "@/shared/operation";
import { equal } from "./equal";
import type { SerializableValue } from "./serialize";

/**
 * canon.equalSchema
 *
 * Performs a deep, order‑independent equality between two Zod schema, by first
 * canonicalizin each input into a deterministic representation—sorting JSON schema,
 * then checking whether the resulting serialized forms are identical.
 *
 * @template T - A Zod schema.
 * @param a - The first schema to compare.
 * @param b - The second schema to compare.
 * @returns `true` if  `a` and `b` are identical; otherwise returns `false`.
 *
 * @example
 * ```ts
 * import { canon } from "@shared/canon";
 *
 * const schema1 = z.object({ b: z.number(), a: z.number() });
 * const schema2 = z.object({ a: z.number(), b: z.number() });
 *
 * // Order of keys and elements does not matter:
 * canon.equalSchema(schema1, schema2);            // → true
 * ```
 */
export const equalSchema = (a: z.ZodType, b: z.ZodType) => {
  const [errJsonA, jsonA] = op.attempt(() => z.toJSONSchema(a, { unrepresentable: "any" }));
  if (errJsonA) return op.failure(errJsonA);
  const [errJsonB, jsonB] = op.attempt(() => z.toJSONSchema(b, { unrepresentable: "any" }));
  if (errJsonB) return op.failure(errJsonB);
  return equal(jsonA as SerializableValue, jsonB as SerializableValue);
};
