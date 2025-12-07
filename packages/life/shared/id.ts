import { init as initCuid2, isCuid } from "@paralleldrive/cuid2";

// Base functions
export function newId(prefix?: string, length = 12) {
  const cuid2 = initCuid2({ length });
  return `${prefix ? `${prefix}_` : ""}${cuid2()}`;
}

export function isValidId(id: string, length = 12) {
  const parts = id.split("_") as [string, string];
  if (parts.length !== 2) return false;
  if (parts[1].length !== length) return false;
  return isCuid(parts[1]);
}
