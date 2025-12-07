import MurmurHash3 from "imurmurhash";
import * as op from "@/shared/operation";
import type { SerializableValue } from "./serialize";
import { stringify } from "./stringify";

/**
 * canon.murmur3
 *
 * MurmurHash3 is a non-cryptographic hash function designed to be fast and
 * have a low collision rate. It is a good choice for hash tables and other
 * data structures where collision resistance is not critical.
 *
 * For secure hashing, use `canon.sha256`.
 *
 * @param value - The value to hash.
 * @returns A 32-bit integer hash of the value.
 *
 * @example
 * ```ts
 * import { canon } from "@shared/canon";
 *
 * canon.murmur3({ a: 1, b: 2 }) === canon.murmur3({ b: 2, a: 1 }); // → true
 * ```
 */

export const murmur3 = (value: SerializableValue) => {
  try {
    const [err, data] = stringify(value);
    if (err) return op.failure(err);
    const [errHash, hashNumber] = op.attempt(() => MurmurHash3(data).result());
    if (errHash) return op.failure(errHash);
    const hash = hashNumber.toString(16);
    return op.success(hash);
  } catch (error) {
    return op.failure({ code: "Unknown", cause: error });
  }
};
