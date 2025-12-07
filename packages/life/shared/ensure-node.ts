/**
 * Throws if executed in non Node.js context (e.g. browser).
 * @param {string} featureName  Name of the feature that must only run in Node.js
 */
export function ensureNode(featureName: string) {
  const isBrowser = typeof window !== "undefined" && typeof window.document !== "undefined";
  if (isBrowser) throw new Error(`❌ "${featureName}" must only run in Node.js.`);
}
