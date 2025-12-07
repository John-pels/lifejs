import * as op from "@/shared/operation";
import type { SerializableValue } from "./serialize";
import { stringify } from "./stringify";

/**
 * canon.equal
 *
 * Performs a deep, order‑independent equality check by first canonicalizing
 * each input into a deterministic representation—sorting object keys,
 * normalizing collection elements (arrays, Maps, Sets), then checking whether
 * the resulting serialized forms are identical.
 *
 * @template T - A value that can be serialized by `canon.stringify` (i.e. SuperJSON‑compatible).
 * @param a - The first value to compare.
 * @param b - The second value to compare.
 * @returns `true` if  `a` and `b` are identical; otherwise returns `false`.
 *
 * @example
 * ```ts
 * import { canon } from "@shared/canon";
 *
 * // Order of keys and elements does not matter:
 * canon.equal({ b: 1, a: 2 }, { a: 2, b: 1 });            // → true
 * canon.equal(new Set([3, 1, 2]), new Set([1, 2, 3]));    // → true
 *
 * // Dates, Regex, Maps, etc. are handled via SuperJSON:
 * canon.equal(new Date("2021-08-01"), "2021-08-01");      // → true
 * ```
 */
export const equal = (a: SerializableValue, b: SerializableValue) => {
  const [err1, data1] = stringify(a, true);
  if (err1) return op.failure(err1);
  const [err2, data2] = stringify(b, true);
  if (err2) return op.failure(err2);
  return op.success(data1 === data2);
};
