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
 * @param {T} a - The first value to compare.
 * @param {T} b - The second value to compare.
 * @returns {boolean} `true` if  `a` and `b` are identical; otherwise returns `false`.
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
export const equal = <T extends SerializableValue>(a: T, b: T): boolean => {
  return stringify(a) === stringify(b);
};
