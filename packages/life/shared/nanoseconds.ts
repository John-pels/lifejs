/**
 * Cross-runtime process.hrtime.bigint() equivalent.
 * - Uses Node's `process.hrtime.bigint()` when available.
 * - Else uses `process.hrtime()` tuple if present.
 * - Else uses browser `performance.now()` (monotonic) converted to ns.
 * - Else falls back to `Date.now()` converted to ns.
 */
const hrtimeBigint: () => bigint = (() => {
  // 1) Native Node: process.hrtime.bigint()
  if (typeof globalThis.process?.hrtime?.bigint === "function") {
    return () => globalThis.process.hrtime.bigint();
  }

  // 2) Node-like tuple: process.hrtime() -> [seconds, nanoseconds]
  if (typeof globalThis.process?.hrtime === "function") {
    return () => {
      const [s, n] = globalThis.process.hrtime() as [number, number];
      return BigInt(s) * 1_000_000_000n + BigInt(n);
    };
  }

  // 3) Browser: performance.now() in milliseconds (fractional), monotonic.
  if (typeof globalThis.performance?.now === "function") {
    let last = 0n;
    return () => {
      const ns = BigInt(Math.floor(globalThis.performance.now() * 1e6));
      if (ns > last) last = ns;
      return last;
    };
  }

  // 4) Final fallback: Date.now() in ms -> ns.
  return () => BigInt(Date.now()) * 1_000_000n;
})();

export const ns = {
  /**
   * Returns the current Unix timestamp in nanoseconds
   * @returns BigInt (ns since epoch)
   */
  now() {
    return hrtimeBigint();
  },

  /**
   * Returns the duration between the current time and the given start time
   * @param start - BigInt (ns since epoch)
   * @returns BigInt (ns)
   */
  since(n?: bigint) {
    if (!n) return 0n;
    return ns.now() - n;
  },

  /**
   * Converts nanoseconds to milliseconds
   * @param ns - BigInt (ns)
   * @returns number (ms)
   */
  toMs(n?: bigint) {
    if (!n) return 0n;
    return n / 1_000_000n;
  },
};
