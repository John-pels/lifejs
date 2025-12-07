// biome-ignore-all lint/style/useUnifiedTypeSignatures: fine

/**
 * The 'operation' library (usually imported as 'op') is a minimal and type-safe
 * helper to enforce return type consistency across the entire codebase.
 *
 *
 * ## Why not using something like Effect.js or NeverThrow?
 *
 * While powerful, those libraries come with significant learning curves. We want
 * the Life.js codebase to remain accessible, so the community can easily engage,
 * learn, and contribute to it. Those libraries were incompatible with this goal.
 *
 * Also, we wanted the solution to be unnoticeable on the public API. The Life.js
 * SDKs shouldn't force developers to think differently about their program design.
 * Complex libraries like Effect.js or NeverThrow were again challenging with that
 * goal, this library solves that in ~100 LOC with the `toPublic()` helper.
 *
 * Still, 'operation' is not a perfect alternative to more complex libraries.
 * For example, it doesn't provide error-level type safety, yet it enforces errors
 * to be narrowed to LifeError (a 9 error codes surface), and strongly encourages
 * contributors to handle them properly. We found it being a good compromise.
 *
 *
 * ## Why 'error' comes first in the result tuple?
 *
 * We use `[error, data]` instead of `[data, error]` for two main reasons:
 *
 * 1. A function doesn't always return data, while it will always return a potential
 * error. When there is no data, with error first we can simply do:
 * ```ts
 * const [err] = op.attempt(...)
 * // instead of the more verbose
 * const [_, err] = op.attempt(...)
 * ```
 *
 * 2. With error first, the developer explicitly acknowledges the potential error
 * before destructuring the data. If `data` was first, it would be easy to:
 * ```ts
 * const [data] = op.attempt(...) // <-- Easy to forget to destructure the error here!
 * if (data) { ... }
 * ```
 */

import z from "zod";
import {
  isLifeError,
  LifeErrorClass,
  type LifeErrorCode,
  type LifeErrorParameters,
  type LifeErrorUnion,
  lifeError,
} from "./error";
import type {
  Any,
  ClassShape,
  IsClass,
  IsFunction,
  IsInstance,
  MaybePromise,
  Opaque,
  Prettify,
} from "./types";

export type OperationData = unknown;

const OPERATION_RESULT = Symbol("OperationResult");
export const isResult = (value: unknown): value is OperationResult<OperationData> =>
  Array.isArray(value) && OPERATION_RESULT in value;

type OperationSuccess<D extends OperationData> = readonly [error: undefined, data: D];
type OperationFailure<_ extends OperationData = never> = readonly [
  error: LifeErrorUnion,
  data: undefined,
];
export type OperationResult<D extends OperationData> = OperationSuccess<D> | OperationFailure<D>;

/**
 * To be returned by functions to indicate success.
 *
 * @param data - (Optional) The return type of the function.
 * @returns An OperationResult tuple containing `[null, data]`.
 *
 * The 'data' argument can also be an OperationResult, in which case it will
 * automatically be unwrapped. This allows seamless chaining of operations.
 *
 * @example
 * ```typescript
 * // Simple value
 * const result = success({ id: 1, name: "Alice" });
 * // result: [null, { id: 1, name: "Alice" }]
 *
 * // Prevents double-wrapping
 * const nested = success(result);
 * // nested: [null, { id: 1, name: "Alice" }] (not double-wrapped)
 * ```
 */
export const success = <const D extends OperationData = void>(data?: D): OperationSuccess<D> => {
  const result = Object.assign([undefined, isResult(data) ? data[1] : data] as const, {
    [OPERATION_RESULT]: true as const,
  }) as OperationSuccess<D>;
  return result;
};

/**
 * To be returned by functions to indicate failure.
 *
 * @param errorOrDef - A LifeError instance or lifeError()-like input object
 * @returns An OperationResult tuple containing `[error, null]`.
 *
 * @example
 * ```typescript
 * // Simple failure
 * const result = failure({ code: "NotFound" });
 * // result: [LifeError, null]
 * ```
 */
export const failure = <Code extends LifeErrorCode, D extends OperationData = never>(
  errorOrDef: LifeErrorParameters<Code>,
): OperationFailure<D> => {
  const error = isLifeError(errorOrDef) ? errorOrDef : lifeError(errorOrDef);
  const result = Object.assign([error, undefined] as const, {
    [OPERATION_RESULT]: true as const,
  }) as OperationFailure<D>;
  return result;
};

/**
 * To be used to execute any function/promise.
 *
 * In case any `throw` happen, or unknown Error or data is returned, those
 * will be swallowed and converted to a compliant OperationResult.
 *
 * @param task - Can be:
 *   - A synchronous function: `() => T`
 *   - An async function: `() => Promise<T>`
 *   - A promise directly: `Promise<T>`
 * @returns An OperationResult or Promise<OperationResult>.
 *
 *
 * @example
 * ```typescript
 * // Sync function - immediate result
 * const [error, parsed] = attempt(() => JSON.parse(jsonString));
 * if (error) {
 *   console.error('Parse failed:', error.code);
 *   return;
 * }
 * console.log('Parsed:', parsed);
 *
 * // Async function - await the result
 * const [err, user] = await attempt(async () => {
 *   const response = await fetch(`/api/users/${id}`);
 *   if (!response.ok) throw new Error('Failed to fetch');
 *   return response.json();
 * });
 *
 * // Direct promise - cleaner for existing promises
 * const [err2, data] = await attempt(fetchUserProfile(userId));
 *
 * // Chaining operations
 * const [err3] = await attempt(async () => {
 *   await validateUser(user);
 *   await saveUser(user);
 *   await notifyUser(user);
 * });
 * if (err3) return failure(err3);
 * ```
 */
export function attempt(task: () => never): OperationResult<never>;
export function attempt(task: () => Promise<never>): Promise<OperationResult<never>>;
export function attempt(task: Promise<never>): Promise<OperationResult<never>>;
export function attempt<D extends OperationData>(
  task: () => Promise<D>,
): Promise<OperationResult<D>>;
export function attempt<D extends OperationData>(task: () => D): OperationResult<D>;
export function attempt<D extends OperationData>(task: Promise<D>): Promise<OperationResult<D>>;

export function attempt<const D extends OperationData>(
  task: (() => D) | Promise<D> | (() => Promise<D>),
): Promise<OperationResult<D>> | OperationResult<D> {
  const handleError = (error: unknown) => {
    if (isLifeError(error)) return failure(error);
    return failure({ code: "Unknown", cause: error });
  };
  const handleResult = (result: D) => {
    if (isResult(result)) return result as OperationResult<D>;
    return success(result) as OperationResult<D>;
  };
  if (task instanceof Promise)
    return task.then(handleResult).catch(handleError) as Promise<OperationResult<D>>;
  try {
    const result = task();
    if (result instanceof Promise)
      return result.then(handleResult).catch(handleError) as Promise<OperationResult<D>>;
    return handleResult(result);
  } catch (error) {
    return handleError(error) as OperationResult<D>;
  }
}

/**
 * Extracts the data from an OperationResult, throwing an error if the result is a failure.
 *
 * @param result - The OperationResult to extract the data from.
 * @returns The data.
 */
export const dataOrThrow = <D extends OperationData>(result: OperationResult<D>): D => {
  if (!isResult(result)) return result;
  const [error, data] = result;
  if (error) throw error;
  return data;
};

// biome-ignore lint/suspicious/noConfusingVoidType: usage of void type is intentional
type VoidIfNever<T> = [T] extends [never] ? void : T;

type IsOpFunction<T> = T extends (...args: Any) => MaybePromise<OperationResult<Any>>
  ? true
  : false;

type IsOpInstance<T> = {
  [K in keyof T]: IsFunction<T[K]> extends true ? IsOpFunction<T[K]> : false;
} extends { [K in keyof T]: false }
  ? false
  : true;

/**
 * In some rare cases where a types produces another type itself containing generics,
 * Typescript won't be able to infer the precise branch and ToPublic will incorreclty
 * match the type and produce broken results.
 * This helper is used to assert that a type is already public and avoid the issue.
 */
export type AssertPublic<T> = T & { [__public]: [T] };
declare const __public: unique symbol;
type IsAsserted<T> = T extends { [__public]: Any } ? true : false;
type UnwrapAssert<T> = T extends { [__public]: [infer U] } ? U : never;

type FunctionToPublic<T> = T extends (
  ...args: infer Args
) => MaybePromise<OperationResult<infer Data>>
  ? Opaque<(...args: Args) => VoidIfNever<Data>>
  : T;

type InstanceToPublic<T> = IsInstance<T> extends true
  ? Prettify<
      {
        [K in keyof T]: ToPublic<T[K]>;
      } & (IsOpInstance<T> extends true
        ? Opaque<{
            safe: {
              [K in keyof T as IsOpFunction<T[K]> extends true ? K : never]: T[K];
            };
          }>
        : unknown)
    >
  : T;

type ClassToPublic<T> = IsClass<T> extends true
  ? Opaque<new (...args: Any) => InstanceToPublic<InstanceType<T extends ClassShape ? T : never>>>
  : T;

export type ToPublic<T> = IsAsserted<T> extends true
  ? UnwrapAssert<T>
  : T extends z.ZodType // Skip any zod type
    ? T
    : IsClass<T> extends true
      ? ClassToPublic<T>
      : IsFunction<T> extends true
        ? FunctionToPublic<T>
        : IsInstance<T> extends true
          ? InstanceToPublic<T>
          : T;

/**
 * Converts an internal function type (returning an OperationResult) into
 * a public function (returning the unwrapped data type).
 *
 * @param func - The internal function to convert.
 * @returns The public function.
 */
const functionToPublic = <
  Func extends (
    ...args: never[]
  ) => OperationResult<OperationData> | Promise<OperationResult<OperationData>>,
>(
  func: Func,
) => {
  const unsafeFunc = (...args: Parameters<Func>) => {
    try {
      const result = func(...args);

      // Handle async functions
      if (result instanceof Promise) {
        return result
          .then((awaitedResult) => {
            if (isResult(awaitedResult)) {
              const [errAsync, dataAsync] = awaitedResult;
              if (errAsync) throw errAsync;
              return dataAsync;
            }
            return awaitedResult;
          })
          .catch((error) => {
            throw error;
          });
      }

      // Handle sync functions
      if (isResult(result)) {
        const [errorSync, dataSync] = result as OperationResult<OperationData>;
        if (errorSync) throw errorSync;
        return dataSync;
      }
      return result;
    } catch (error) {
      if (error instanceof Error) throw error;
      throw error;
    }
  };

  return unsafeFunc as FunctionToPublic<Func>;
};

/**
 * Converts an internal instance/object type (with methods returning OperationResult)
 * into a public instance (with methods returning the unwrapped data types).
 *
 * The original instance/object is kept under the `.safe` property.
 *
 * @param instance - The internal instance to convert.
 * @returns The public instance.
 */
const instanceToPublic = <Instance extends object>(instance: Instance) => {
  // Cache to prevent circular references and redundant wrapping
  const wrappedCache = new WeakMap<object, object>();

  const createProxy = (target: object): object => {
    // Return cached version if already wrapped
    if (wrappedCache.has(target)) return wrappedCache.get(target) as object;

    const proxy = new Proxy(target, {
      get(innerTarget, prop) {
        // Preserve access to original unwrapped instance (entire tree)
        if (prop === "safe") return innerTarget;

        const value = innerTarget[prop as keyof typeof innerTarget] as unknown;

        // Wrap functions at any depth
        if (typeof value === "function") {
          return functionToPublic(value.bind(innerTarget));
        }

        // Recursively wrap objects and class instances
        if (value !== null && typeof value === "object") {
          // Skip built-in types that could break if proxied
          const shouldSkip =
            value instanceof Date ||
            value instanceof RegExp ||
            value instanceof Promise ||
            Array.isArray(value) ||
            value instanceof Map ||
            value instanceof Set ||
            value instanceof WeakMap ||
            value instanceof WeakSet ||
            ArrayBuffer.isView(value); // typed arrays, DataView, etc.

          if (shouldSkip) return value;

          // Recursively wrap plain objects and custom class instances
          return createProxy(value);
        }

        // Primitives and other values returned as-is
        return value;
      },
    });

    wrappedCache.set(target, proxy);
    return proxy;
  };

  return createProxy(instance) as InstanceToPublic<Instance>;
};

/**
 * Converts an internal class type (with methods returning OperationResult)
 * into a public class type (with methods returning the unwrapped data types).
 *
 * The original class type is kept under the `.safe` property.
 *
 * @param InternalClass - The internal class to convert.
 * @returns The public class.
 */
const classToPublic = <Class extends ClassShape>(InternalClass: Class): ClassToPublic<Class> =>
  new Proxy(InternalClass, {
    construct(target, args) {
      const instance = new target(...args);
      return instanceToPublic(instance);
    },
  }) as ClassToPublic<Class>;

/**
 * Converts any internal types (functions, instances, objects, or classes)
 * to use unwrapped data types instead of OperationResult.
 *
 * @param input - The internal implementation to convert (class, function, or instance)
 * @returns The public equivalent
 */
export function toPublic<T>(input: T) {
  // Check if it's a class constructor
  if (typeof input === "function" && input.prototype && input.prototype.constructor === input) {
    // biome-ignore lint/suspicious/noExplicitAny: needed for type routing
    return classToPublic(input as any) as ToPublic<T>;
  }

  // Check if it's a regular function
  if (typeof input === "function") {
    // biome-ignore lint/suspicious/noExplicitAny: needed for type routing
    return functionToPublic(input as any) as ToPublic<T>;
  }

  // Check if it's an object instance
  if (typeof input === "object" && input !== null) {
    return instanceToPublic(input) as ToPublic<T>;
  }

  // Return as-is for primitive types
  return input as ToPublic<T>;
}

// Export a Zod schema for the OperationResult type
export const resultSchema = z
  .tuple([z.null().or(z.undefined()), z.unknown()])
  .or(z.tuple([z.instanceof(LifeErrorClass), z.null().or(z.undefined())]))
  .transform((val): OperationResult<OperationData> => {
    // Restore the OPERATION_RESULT symbol that Zod parsing strips
    const [error, data] = val;
    if (error) return failure(error);
    return success(data);
  });

/**
 * Serializes an OperationResult into a plain object for transport.
 *
 * @param result - The OperationResult to serialize
 * @returns A plain object with _isOperationResult marker and the result data
 *
 * @example
 * ```typescript
 * const result = success({ id: 1, name: "Alice" });
 * const serialized = serializeResult(result);
 * // serialized: { _isOperationResult: true, result: [undefined, { id: 1, name: "Alice" }] }
 * ```
 */
export function serializeResult<D extends OperationData>(
  result: OperationResult<D>,
): { _isOperationResult: true; result: [LifeErrorUnion | undefined, D | undefined] } {
  if (!isResult(result)) {
    throw new Error("The provided value is not an OperationResult");
  }
  return {
    _isOperationResult: true,
    // Extract the tuple without the symbol to avoid recursive serialization
    result: [result?.[0], result?.[1]],
  };
}

/**
 * Deserializes a plain object back into an OperationResult with the proper symbol.
 *
 * @param obj - The serialized object to deserialize
 * @returns An OperationResult with the OPERATION_RESULT symbol attached
 *
 * @example
 * ```typescript
 * const serialized = { _isOperationResult: true, result: [undefined, { id: 1, name: "Alice" }] };
 * const result = deserializeResult(serialized);
 * // result is now a proper OperationResult that will pass isResult() check
 * ```
 */
export function deserializeResult<D extends OperationData>(obj: {
  _isOperationResult: true;
  result: readonly [LifeErrorUnion | undefined, D | undefined];
}): OperationResult<D> {
  if (!obj._isOperationResult) {
    throw new Error("The provided object is not a serialized OperationResult");
  }
  if (!Array.isArray(obj.result) || obj.result.length !== 2) {
    throw new Error("The provided object is not a serialized OperationResult");
  }

  const [error, data] = obj.result;

  // Reconstruct the OperationResult with the symbol
  if (error) return failure(error) as OperationResult<D>;
  return success(data) as OperationResult<D>;
}
