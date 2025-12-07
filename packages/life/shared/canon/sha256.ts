import * as op from "@/shared/operation";
import type { SerializableValue } from "./serialize";
import { stringify } from "./stringify";

/**
 * canon.sha256
 *
 * Produces a deterministic SHA‑256 digest for any value supported by
 * `canon.serialize`. The value is first canonicalized (keys sorted, collection
 * elements normalized, special types preserved) via `canon.stringify`, and the
 * resulting canonical string is then hashed. Because the canonical form is
 * order‑insensitive, structurally equivalent inputs always yield the same hash.
 *
 * For fast and synchronous hashing, see `canon.murmur3`.
 *
 * @param value - The value to hash.
 * @returns A 64‑character, lowercase hex SHA‑256 digest of the value’s canonical form.
 *
 * @example
 * ```ts
 * import { canon } from "@shared/canon";
 *
 * // Key order does not affect the hash:
 * canon.sha256({ b: 1, a: 2 }) === canon.sha256({ a: 2, b: 1 }); // → true
 *
 * // Works with Sets, Maps, Dates, BigInts, etc. (as supported by canon.serialize):
 * canon.sha256(new Set([3, 1, 2]));
 * canon.sha256(new Map([["b", 1], ["a", 2]]));
 * canon.sha256(new Date("2021-08-01"));
 * ```
 */

export const sha256 = async (value: SerializableValue) => {
  try {
    const [err, data] = stringify(value);
    if (err) return op.failure(err);
    const hashedData = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", hashedData);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return op.success(hash);
  } catch (error) {
    return op.failure({ code: "Unknown", cause: error });
  }
};
