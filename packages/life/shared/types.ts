/**
 * Avoids repeating the same type signature for functions that can return a promise or not.
 */
export type MaybePromise<T> = T | Promise<T>;

export type ClassShape = new (
  // biome-ignore lint/suspicious/noExplicitAny: on purpose
  ...args: any[]
  // biome-ignore lint/suspicious/noExplicitAny: on purpose
) => any;

export type FunctionShape = (
  // biome-ignore lint/suspicious/noExplicitAny: on purpose
  ...args: any[]
  // biome-ignore lint/suspicious/noExplicitAny: on purpose
) => any;
