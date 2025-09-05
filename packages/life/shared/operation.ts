// biome-ignore-all lint/style/useUnifiedTypeSignatures: test

/**
 * The 'operation' library (often imported as 'op') is a minimal and type-safe
 * return type management helper that enforces consistency across the entire framework.
 *
 *
 * ## Why not using something like Effect.js or NeverThrow?
 *
 * While powerful those libraries come with significant learning curves, and we
 * want the Life.js to remain accessible, so the community can easily engage,
 * learn, and contribute to it. This was incompatible with this goal.
 *
 * This 'operation' helper doesn't provide error-level type safety though, but it
 * enforces errors to be narrowed to LifeError (9 error codes surface), and strongly
 * encourages the developer to handle them properly.
 *
 * We found it being a good compromise here.
 *
 *
 * ## Why 'error' comes first in tuple?
 *
 * We use `[error, data]` instead of `[data, error]` for two main reasons:
 *
 * 1. Many times, a function/method will not return any data, we still want
 * to consume any potential error coming from it. With error first we can simply
 * do `const [err] = op.attempt(...)` instead of `const [_, err] = op.attempt(...)`.
 *
 * 2. With error first, we ensure the developer acknowledges the potential error, as it
 * has to be destructured before accessing the data. If `data` was first, we could do:
 * ```typescript
 * const [data] = op.attempt(...) // <-- Easy to forget to destructure the error here!
 * if (data) { ... }
 */

import { isLifeError, type LifeError, lifeError } from "./error";

type OperationData = unknown;
type OperationError = LifeError;

const OPERATION_RESULT = Symbol("OperationResult");
const isResult = (value: unknown): value is OperationResult<OperationData> =>
  Array.isArray(value) && OPERATION_RESULT in value;

type OperationSuccess<D extends OperationData> = readonly [error: null, data: D] & {
  [OPERATION_RESULT]: true;
};
type OperationFailure<_ extends OperationData = never> = readonly [
  error: OperationError,
  data: null,
] & { [OPERATION_RESULT]: true };
type OperationResult<D extends OperationData> = OperationSuccess<D> | OperationFailure<D>;

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
export const success = <const DR extends OperationDataOrResult>(
  data?: DR,
): OperationSuccess<OperationEnsureData<DR>> => {
  return Object.assign([null, isResult(data) ? data[1] : data] as const, {
    [OPERATION_RESULT]: true as const,
  }) as OperationSuccess<OperationEnsureData<DR>>;
};

/**
 * To be returned by functions to indicate failure.
 *
 * @param error - A LifeError instance describing what went wrong
 * @returns An OperationResult tuple containing `[error, null]`.
 *
 * @example
 * ```typescript
 * // Simple failure
 * const result = failure(lifeError({ code: "NotFound" }));
 * // result: [LifeError, null]
 * ```
 */
export const failure = <D extends OperationData = never>(
  error: OperationError,
): OperationFailure<D> =>
  Object.assign([error, null] as const, {
    [OPERATION_RESULT]: true as const,
  }) as OperationFailure<D>;

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
    return failure(lifeError({ code: "Unhandled", cause: error }));
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

/**
 * The operation helper library.
 *
 * It is typically imported as 'op' for brevity:
 * ```typescript
 * import { operation as op } from "life/shared";
 * ```
 *
 * It contains the following utilities:
 * - `success`: To be returned by functions to indicate success.
 * - `failure`: To be returned by functions to indicate failure.
 * - `attempt`: To be used to execute any function/promise.
 * - `isResult`: To check if a value is an OperationResult.
 *
 * See the source code for more details.
 *
 * @example
 * ```typescript
 * import { operation as op } from "life/shared/operation";
 *
 * // Use all utilities through the namespace
 * async function createUser(data: UserData) {
 *   const [err, validated] = op.attempt(() => validateUserData(data));
 *   if (err) return op.failure(err);
 *
 *   const [err2, saved] = await op.attempt(() => db.users.create(validated));
 *   if (err2) return op.failure(err2);
 *
 *   return op.success(saved);
 * }
 * ```
 */
export const operation = {
  success,
  failure,
  attempt,
  isResult,
};
