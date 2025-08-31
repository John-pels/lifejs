export const ns = {
  /**
   * Returns the current Unix timestamp in nanoseconds
   * @returns BigInt (ns since epoch)
   */
  now() {
    return process.hrtime.bigint();
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
