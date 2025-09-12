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
 * learn, and contribute to it. This was incompatible with this goal.
 *
 * Also, we wanted the solution to be unnoticeable on the public API. The Life.js
 * SDKs shouldn't force developers to think differently about their program design.
 * Complex libraries like Effect.js or NeverThrow were challenging with that goal, this
 * library solves that in ~50 LOC with `functionToUnsafe()` and `instanceToUnsafe()`.
 *
 * Ultimately, 'operation' is not a perfect alternative to more complex libraries.
 * For example, it doesn't provide error-level type safety. Still it enforces errors
 * to be narrowed to LifeError (9 error codes surface), and strongly encourages
 * code contributors to handle them properly. We found it being a good compromise.
 *
 *
 * ## Why 'error' comes first in tuple?
 *
 * We use `[error, data]` instead of `[data, error]` for two main reasons:
 *
 * 1. A function doesn't always return data, while it will always return a potential
 * error. When there is no data, with error first we can simply do:
 * ```ts
 * const [err] = op.attempt(...)
 * // instead of
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

import {
  isLifeError,
  type LifeError,
  type LifeErrorParams,
  lifeError,
  type lifeErrorCodes,
} from "./error";
import type { ClassShape } from "./types";

export type OperationData = unknown;

const OPERATION_RESULT = Symbol("OperationResult");
export const isResult = (value: unknown): value is OperationResult<OperationData> =>
  Array.isArray(value) && OPERATION_RESULT in value;

type OperationSuccess<D extends OperationData> = readonly [error: undefined, data: D];
type OperationFailure<_ extends OperationData = never> = readonly [
  error: LifeError,
  data: undefined,
];
export type OperationResult<D extends OperationData> = OperationSuccess<D> | OperationFailure<D>;

type OperationDataOrResult = OperationData | OperationResult<OperationData>;
type OperationEnsureResult<DR extends OperationDataOrResult> = DR extends OperationResult<infer D1>
  ? OperationResult<D1>
  : OperationResult<DR>;
type OperationEnsureData<DR extends OperationDataOrResult> = DR extends OperationResult<infer D1>
  ? D1
  : DR;

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
export const success = <const DR extends OperationDataOrResult = void>(
  data?: DR,
): OperationSuccess<OperationEnsureData<DR>> => {
  const result = Object.assign([undefined, isResult(data) ? data[1] : data] as const, {
    [OPERATION_RESULT]: true as const,
  }) as OperationSuccess<OperationEnsureData<DR>>;
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
export const failure = <Code extends keyof typeof lifeErrorCodes, D extends OperationData = never>(
  errorOrDef: LifeErrorParams<Code>,
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
export function attempt<DR extends OperationDataOrResult>(
  task: () => Promise<DR>,
): Promise<OperationEnsureResult<DR>>;
export function attempt<DR extends OperationDataOrResult>(
  task: () => DR,
): OperationEnsureResult<DR>;
export function attempt<DR extends OperationDataOrResult>(
  task: Promise<DR>,
): Promise<OperationEnsureResult<DR>>;

export function attempt<const DR extends OperationDataOrResult>(
  task: (() => DR) | Promise<DR> | (() => Promise<DR>),
): Promise<OperationEnsureResult<DR>> | OperationEnsureResult<DR> {
  const handleError = (error: unknown): OperationFailure<OperationEnsureData<DR>> => {
    if (isLifeError(error)) return failure(error);
    return failure({ code: "Unknown", error });
  };
  const handleResult = (result: DR): OperationEnsureResult<DR> => {
    if (isResult(result)) return result as OperationEnsureResult<DR>;
    return success(result) as OperationEnsureResult<DR>;
  };
  if (task instanceof Promise)
    return task.then(handleResult).catch(handleError) as Promise<OperationEnsureResult<DR>>;
  try {
    const result = task();
    if (result instanceof Promise)
      return result.then(handleResult).catch(handleError) as Promise<OperationEnsureResult<DR>>;
    return handleResult(result);
  } catch (error) {
    return handleError(error) as OperationEnsureResult<DR>;
  }
}

// biome-ignore lint/suspicious/noConfusingVoidType: usage of void type is intentional
type VoidIfNever<T> = [T] extends [never] ? void : T;

/**
 * Converts an internal function type (returning an OperationResult) into an public
 * function (returning the raw data type).
 */
type FunctionToPublic<Func> = Func extends (...args: infer Args) => OperationResult<infer Data>
  ? (...args: Args) => VoidIfNever<Data>
  : Func extends (...args: infer Args) => Promise<OperationResult<infer Data>>
    ? (...args: Args) => Promise<VoidIfNever<Data>>
    : Func;

/**
 * Converts an internal instance type (with methods returning OperationResult)
 * into an public instance (with methods returning the raw data types).
 * The internal methods are kept under the nested `.safe` property.
 */
type InstanceToPublic<Instance extends object> = {
  safe: {
    [K in keyof Instance as Instance[K] extends (
      ...args: infer _Args
    ) => OperationResult<infer _Data> | Promise<OperationResult<infer __Data>>
      ? K
      : never]: Instance[K];
  };
} & { [K in keyof Instance]: FunctionToPublic<Instance[K]> };

/**
 * Converts an internal class type (with methods returning OperationResult)
 * into a public class type (with methods returning the raw data types).
 * When instantiated, instances will have internal methods available under `.safe`.
 */
type ClassToPublic<Class extends ClassShape> = new (
  ...args: ConstructorParameters<Class>
) => InstanceToPublic<InstanceType<Class>>;

/**
 * Converts an internal function (returning an OperationResult) into an public
 * function (returning the raw data type).
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
    const result = func(...args);

    // Handle async functions
    if (result instanceof Promise) {
      return result.then(([errAsync, dataAsync]) => {
        if (errAsync) throw errAsync;
        return dataAsync;
      });
    }

    // Handle sync functions
    const [errorSync, dataSync] = result as OperationResult<unknown>;
    if (errorSync) throw errorSync;
    return dataSync;
  };

  return unsafeFunc as FunctionToPublic<Func>;
};

/**
 * Converts an internal instance (with methods returning OperationResult)
 * into a public instance (with methods returning the raw data types).
 * The internal methods are kept under the nested `.safe` property.
 *
 * @param instance - The internal instance to convert.
 * @returns The public instance.
 */
const instanceToPublic = <Instance extends object>(instance: Instance) => {
  return new Proxy(instance, {
    get(target, prop) {
      if (prop === "safe") return target;

      const value = target[prop as keyof Instance];
      if (typeof value === "function") {
        return functionToPublic(value.bind(target));
      }

      return value;
    },
  }) as InstanceToPublic<Instance>;
};

/**
 * Converts an internal class (with methods returning OperationResult)
 * into a public class (with methods returning the raw data types).
 * When instantiated, instances will have internal methods available under `.safe`.
 *
 * @param InternalClass - The internal class to convert.
 * @returns The public class.
 */
const classToPublic = <Class extends ClassShape>(InternalClass: Class): ClassToPublic<Class> => {
  return new Proxy(InternalClass, {
    construct(target, args) {
      const instance = new target(...args);
      return instanceToPublic(instance);
    },
  }) as ClassToPublic<Class>;
};

/**
 * Unified type that converts internal types (functions, instances, or classes)
 * to their public equivalents based on the input type.
 */
export type ToPublic<T> = T extends ClassShape
  ? ClassToPublic<T>
  : T extends (
        ...args: infer _Args
      ) => OperationResult<infer _Data> | Promise<OperationResult<infer __Data>>
    ? FunctionToPublic<T>
    : T extends object
      ? InstanceToPublic<T>
      : T;

/**
 * Unified function that converts internal implementations to their public equivalents.
 * Automatically routes to the appropriate conversion based on the input type:
 * - Classes: Returns a new class that produces public instances
 * - Functions: Returns a function that throws errors instead of returning them
 * - Objects: Returns an instance with public methods and `.safe` property
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
