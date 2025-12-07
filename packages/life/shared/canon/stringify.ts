/**
 * This function stringifies a given object into a JSON string, producing an
 * output with a stable keys order compared to JSON.stringify().
 *
 * Source: fast-json-stable-stringify (https://github.com/epoberezkin/fast-json-stable-stringify/blob/master/index.js)
 */

import * as op from "@/shared/operation";
import { deserialize, type SerializableValue, serialize } from "./serialize";
// biome-ignore-start lint/style: reason
// biome-ignore-start lint/suspicious: reason
// biome-ignore-start lint/complexity: reason
// biome-ignore-start lint/correctness: reason

export function stableDeepStringify(data: any, sortArrays: boolean, opts?: any): string {
  if (!opts) opts = {};
  if (typeof opts === "function") opts = { cmp: opts };
  var cycles = typeof opts.cycles === "boolean" ? opts.cycles : false;

  var cmp =
    opts.cmp &&
    ((f) => (node: any) => (a: any, b: any) => {
      var aobj = { key: a, value: node[a] };
      var bobj = { key: b, value: node[b] };
      return f(aobj, bobj);
    })(opts.cmp);

  var seen: any[] = [];
  return (function stringify_(node: any): string {
    if (node && node.toJSON && typeof node.toJSON === "function") {
      node = node.toJSON();
    }

    if (node === undefined) return "";
    if (typeof node == "number") return isFinite(node) ? "" + node : "null";
    if (typeof node !== "object") return JSON.stringify(node);

    var i, out;
    if (Array.isArray(node)) {
      const items = node.map((item) => stringify_(item) || "null");
      if (sortArrays) items.sort();
      return "[" + items.join(",") + "]";
    }

    if (node === null) return "null";

    if (seen.indexOf(node) !== -1) {
      if (cycles) return JSON.stringify("__cycle__");
      throw new TypeError("Converting circular structure to JSON");
    }

    var seenIndex = seen.push(node) - 1;
    var keys = Object.keys(node).sort(cmp && cmp(node));
    out = "";
    for (i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value = stringify_(node[key!]);

      if (!value) continue;
      if (out) out += ",";
      out += JSON.stringify(key) + ":" + value;
    }
    seen.splice(seenIndex, 1);
    return "{" + out + "}";
  })(data);
}

// biome-ignore-end lint/style: reason
// biome-ignore-end lint/suspicious: reason
// biome-ignore-end lint/complexity: reason
// biome-ignore-end lint/correctness: reason

/**
 * canon.stringify
 *
 * Converts any value supported by `canon.serialize` into a **canonical, deterministic,
 * order‑insensitive string**. Objects have their keys sorted, collection types
 * (Arrays, Maps, Sets) are normalized, and special primitives are preserved during
 * serialization so that structurally equivalent values always stringify to the same
 * output.
 *
 * @param value - The value to canonicalize and stringify.
 * @returns A canonical JSON string representing the value.
 *
 * @example
 * ```ts
 * import { stringify } from "@shared/canon";
 *
 * // Key / element order does not change the result:
 * stringify({ b: 1, a: 2 }) === stringify({ a: 2, b: 1 }); // → true
 *
 * // Collections are normalized:
 * stringify(new Set([3, 1, 2])) === stringify(new Set([1, 2, 3])); // → true
 * ```
 */
export const stringify = (value: SerializableValue, sortArrays = false) => {
  const [err, res] = serialize(value);
  if (err) return op.failure(err);
  return op.attempt(() => stableDeepStringify(res, sortArrays));
};

/**
 * canon.parse
 *
 * Reconstructs a value previously produced by `canon.stringify` by first parsing
 * the JSON string and then running it through `canon.deserialize`, restoring
 * special types supported by the canon layer.
 *
 * @param value - A canonical string produced by `canon.stringify`.
 * @returns The deserialized value.
 *
 * @throws If `value` is not valid JSON.
 * @example
 * ```ts
 * import { stringify, parse } from "@shared/canon";
 *
 * const s = stringify(new Map([["a", 1], ["b", 2]]));
 * const v = parse(s); // → Map { "a" => 1, "b" => 2 }
 * ```
 */
export const parse = (value: string): op.OperationResult<SerializableValue> => {
  const [err, res] = op.attempt(() => JSON.parse(value));
  if (err) return op.failure(err);
  return deserialize(res);
};
