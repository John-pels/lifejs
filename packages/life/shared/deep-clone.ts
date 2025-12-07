// @ts-nocheck

// biome-ignore-start lint/style: reason
// biome-ignore-start lint/suspicious: reason
// biome-ignore-start lint/complexity: reason
// biome-ignore-start lint/correctness: reason
// biome-ignore-start lint/nursery: reason

/**
 * This function deep copies a given object, with higher performances than the
 * native structuredClone() function, and more flexibility (e.g., supports objects
 * containing functions).
 *
 * Source: Klona (https://github.com/lukeed/klona/blob/master/src/full.js)
 */
export function deepClone<T>(x: T): T {
  if (typeof x !== "object") return x;

  var i = 0,
    k,
    list,
    tmp,
    str = Object.prototype.toString.call(x);

  if (str === "[object Object]") {
    tmp = Object.create(x.__proto__ || null);
  } else if (str === "[object Array]") {
    tmp = Array(x.length);
  } else if (str === "[object Set]") {
    tmp = new Set();
    x.forEach(function (val) {
      tmp.add(deepClone(val));
    });
  } else if (str === "[object Map]") {
    tmp = new Map();
    x.forEach(function (val, key) {
      tmp.set(deepClone(key), deepClone(val));
    });
  } else if (str === "[object Date]") {
    tmp = new Date(+x);
  } else if (str === "[object RegExp]") {
    tmp = new RegExp(x.source, x.flags);
  } else if (str === "[object DataView]") {
    tmp = new x.constructor(deepClone(x.buffer));
  } else if (str === "[object ArrayBuffer]") {
    tmp = x.slice(0);
  } else if (str.slice(-6) === "Array]") {
    // ArrayBuffer.isView(x)
    // ~> `new` bcuz `Buffer.slice` => ref
    tmp = new x.constructor(x);
  }

  if (tmp) {
    for (list = Object.getOwnPropertySymbols(x); i < list.length; i++) {
      set(tmp, list[i], Object.getOwnPropertyDescriptor(x, list[i]));
    }

    for (i = 0, list = Object.getOwnPropertyNames(x); i < list.length; i++) {
      if (Object.hasOwnProperty.call(tmp, (k = list[i])) && tmp[k] === x[k]) continue;
      set(tmp, k, Object.getOwnPropertyDescriptor(x, k));
    }
  }

  return tmp || x;
}

function set(obj, key, val) {
  if (typeof val.value === "object") val.value = deepClone(val.value);
  if (
    !val.enumerable ||
    val.get ||
    val.set ||
    !val.configurable ||
    !val.writable ||
    key === "__proto__"
  ) {
    Object.defineProperty(obj, key, val);
  } else obj[key] = val.value;
}

// biome-ignore-end lint/style: reason
// biome-ignore-end lint/suspicious: reason
// biome-ignore-end lint/complexity: reason
// biome-ignore-end lint/correctness: reason
// biome-ignore-end lint/nursery: reason
