/**
 * Avoids repeating the same type signature for functions that can return a promise or not.
 */
export type MaybePromise<T> = T | Promise<T>;

// export type ClassShape = new (
//   // biome-ignore lint/suspicious/noExplicitAny: on purpose
//   ...args: any[]
// ) => any;

export interface ClassShape {
  prototype: object;
  // biome-ignore lint/suspicious/noExplicitAny: on purpose
  new (...arguments_: any[]): any;
}

export type FunctionShape = (
  // biome-ignore lint/suspicious/noExplicitAny: on purpose
  ...args: any[]
  // biome-ignore lint/suspicious/noExplicitAny: on purpose
) => any;

export type Prettify<T> = { [K in keyof T]: T[K] } & {};

// biome-ignore lint/suspicious/noExplicitAny: on purpose
export type Any = any;
// biome-ignore lint/suspicious/noExplicitAny: on purpose
export type Todo = any;

export type IsAny<T> = 0 extends 1 & T ? true : false;
export type IsNever<T> = [T] extends [never] ? true : false;
export type IsFunction<T> = T extends (...args: Any) => Any ? true : false;
export type IsInstance<T> =
  IsAny<T> extends true
    ? false
    : IsNever<T> extends true
      ? false
      : IsFunction<T> extends true
        ? false
        : T extends object
          ? true
          : false;
export type IsClass<T> = T extends ClassShape ? (ClassShape extends T ? true : false) : false;

/**
 * Override a property type in an object without creating nested type aliases.
 *
 * Unlike `Omit<T, K> & { [K]: V }` which creates type alias references that nest
 * when chained, this produces an evaluated (expanded) type. This prevents type
 * instantiation depth issues common in builder patterns where types are repeatedly
 * transformed.
 *
 * @example
 * type User = { name: string; age: number };
 * type UpdatedUser = Override<User, "age", string>; // { name: string; age: string }
 */
export type Override<T extends object, K extends keyof T, V> = Prettify<{
  [I in keyof T]: I extends K ? V : T[I];
}>;

/**
 * Extract specific properties from an object, producing an expanded type.
 *
 * Functionally similar to `Pick<T, K>` but ensures the result is an evaluated type
 * rather than a type alias reference, preventing excessive type nesting in chained
 * transformations.
 *
 * @example
 * type User = { name: string; age: number; email: string };
 * type Credentials = With<User, "name" | "email">; // { name: string; email: string }
 */
export type With<T extends object, K extends keyof T> = Prettify<{
  [I in keyof T as I extends K ? I : never]: T[I];
}>;

/**
 * Exclude specific properties from an object, producing an expanded type.
 *
 * Functionally similar to `Omit<T, K>` but ensures the result is an evaluated type
 * rather than a type alias reference, preventing excessive type nesting in chained
 * transformations.
 *
 * @example
 * type User = { name: string; age: number; email: string };
 * type PublicUser = Without<User, "email">; // { name: string; age: number }
 */
export type Without<T extends object, K extends keyof T> = Prettify<{
  [I in keyof T as I extends K ? never : I]: T[I];
}>;

declare const __opaque: unique symbol;
export type Opaque<T> = T & { [__opaque]?: never };
