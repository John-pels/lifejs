import z from "zod";
import type { SerializableValue } from "./canon";
import { newId } from "./prefixed-id";

// Codes
interface LifeErrorCodeDefinition {
  retriable: boolean;
  defaultMessage: string;
  httpEquivalent: number;
  extraSchema: z.ZodObject<Record<string, z.ZodType<SerializableValue>>>;
}

export const lifeErrorCodes = {
  /**
   * Used when the user sends or the server returns invalid data.
   */
  Validation: {
    retriable: false,
    defaultMessage: "Invalid data provided.",
    httpEquivalent: 400,
    extraSchema: z.object({
      /**
       * Optionally, the ZodError that was thrown (if the input error comes from a Zod schema).
       */
      zodError: z.instanceof(z.ZodError).optional(),
    }),
  },
  /**
   * Used when the user is not authorized to access a resource
   */
  Forbidden: {
    retriable: false,
    defaultMessage: "Not allowed to access this resource.",
    httpEquivalent: 403,
    extraSchema: z.object({}),
  },
  /**
   * Used when an operation took too long and timed out.
   */
  Timeout: {
    retriable: true,
    defaultMessage: "Operation timed out.",
    httpEquivalent: 504,
    extraSchema: z.object({}),
  },
  /**
   * Used when the user has exceeded the rate limit for a resource.
   */
  RateLimit: {
    retriable: true,
    defaultMessage: "Rate limit exceeded.",
    httpEquivalent: 429,
    extraSchema: z.object({}),
  },
  /**
   * Used when a resource was not found or missing.
   */
  NotFound: {
    retriable: false,
    defaultMessage: "Resource not found.",
    httpEquivalent: 404,
    extraSchema: z.object({}),
  },
  /**
   * Used when an operation is about to conflict with another.
   * E.g., a version mismatch, a unique constraint violation, etc.
   */
  Conflict: {
    retriable: false,
    defaultMessage: "Operation conflicted.",
    httpEquivalent: 409,
    extraSchema: z.object({}),
  },
  /**
   * Used when an upstream service or resource fails.
   * E.g., a database connection error, an OpenAI API downtime, etc.
   */
  Upstream: {
    retriable: true,
    defaultMessage: "Upstream error.",
    httpEquivalent: 502,
    extraSchema: z.object({}),
  },
  /**
   * Used when an unexpected error is thrown.
   */
  Unknown: {
    retriable: false,
    defaultMessage: "Unknown error.",
    httpEquivalent: 500,
    extraSchema: z.object({
      /**
       * The unhandled thrown value.
       */
      error: z.any(),
    }),
  },
  /**
   * Used to obfuscate internal errors publicly.
   * Prevents leaking sensitive informations to public consumers.
   */
  Internal: {
    retriable: true,
    defaultMessage: "Internal error.",
    httpEquivalent: 500,
    extraSchema: z.object({}),
  },
} as const satisfies Record<string, LifeErrorCodeDefinition>;

export type LifeErrorCode = keyof typeof lifeErrorCodes;

// Attributes
export type LifeErrorAttributes = Record<string, SerializableValue>;

/**
 * @internal Use `lifeError()` instead.
 */
export class LifeErrorClass extends Error {
  readonly name = "LifeError";

  /**
   * The unique identifier of the error.
   */
  readonly id: string = newId("error");
  /**
   * The error code.
   * Can be one of:
   * - Validation
   * - Forbidden
   * - Timeout
   * - RateLimit
   * - NotFound
   * - Conflict
   * - Upstream
   * - Unknown
   * - Internal
   */
  readonly code: LifeErrorCode;
  /**
   * Additional pieces of evidence attached to the error.
   */
  readonly attributes: LifeErrorAttributes;
  /**
   * Used to indicate whether the operation that caused the error can be retried.
   */
  readonly retriable: boolean;
  /**
   * The number of milliseconds to wait before retrying the operation that caused the error.
   * Check `.retriable` first to ensure the operation can be retried.
   */
  readonly retryAfterMs?: number;
  /**
   * The HTTP status code equivalent to the error code.
   */
  readonly httpEquivalent: number;
  /**
   * Used to indicate whether this error is public and can be safely sent to external clients.
   */
  readonly isPublic: boolean;
  /**
   * @internal Use attributes on the error directly, e.g. `error.zodError` instead of `error._extra.zodError`.
   */
  readonly _extra: z.output<(typeof lifeErrorCodes)[LifeErrorCode]["extraSchema"]>;

  constructor({
    code,
    message,
    attributes,
    retryAfterMs,
    isPublic = false,
    extra,
  }: {
    code: LifeErrorCode;
    message?: string;
    attributes?: LifeErrorAttributes;
    retryAfterMs?: number;
    isPublic?: boolean;
    extra: z.output<(typeof lifeErrorCodes)[LifeErrorCode]["extraSchema"]>;
  }) {
    const definition = lifeErrorCodes[code];
    super(message ?? definition.defaultMessage);
    this.code = code;
    this.retriable = definition.retriable;
    this.attributes = attributes ?? {};
    this.retryAfterMs = retryAfterMs;
    this.httpEquivalent = definition.httpEquivalent;
    this.isPublic = isPublic;

    // Store extra attributes both as a whole and individually
    this._extra = extra;
    // @ts-expect-error - runtime only
    for (const key of Object.keys(extra)) this[key] = extra[key];

    // Clean stack capture
    if (Error.captureStackTrace) Error.captureStackTrace(this, LifeErrorClass);
  }

  toJSON() {
    return {
      id: this.id,
      code: this.code,
      message: this.message,
      retriable: this.retriable,
      attributes: this.attributes,
      retryAfterMs: this.retryAfterMs,
      httpEquivalent: this.httpEquivalent,
      stack: this.stack,
      extra: this._extra,
    };
  }
}

/**
 * Error emitted by the Life.js framework.
 * Check attributes documentation for more information.
 */
export type LifeError<Code extends LifeErrorCode = LifeErrorCode> = LifeErrorClass & {
  code: Code;
} & z.output<(typeof lifeErrorCodes)[Code]["extraSchema"]>;

/**
 * Union of all LifeError types.
 */
export type LifeErrorUnion<Code extends LifeErrorCode = LifeErrorCode> = Code extends LifeErrorCode
  ? LifeError<Code>
  : never;

// lifeError() parameters exported as a type (also used in '@/shared/operation')
export type CreateLifeErrorParams<Code extends LifeErrorCode> = {
  code: Code;
  message?: string;
  attributes?: LifeErrorAttributes;
  retryAfterMs?: number;
  isPublic?: boolean;
} & ((typeof lifeErrorCodes)[Code]["extraSchema"] extends LifeErrorCodeDefinition["extraSchema"]
  ? z.output<(typeof lifeErrorCodes)[Code]["extraSchema"]>
  : // biome-ignore lint/complexity/noBannedTypes: fine here
    {});

/**
 * Creates a new LifeError instance.
 * @param params
 * @returns
 */
export function lifeError<Code extends LifeErrorCode>(
  params: CreateLifeErrorParams<Code>,
): LifeError<Code> {
  const { code, message, attributes, retryAfterMs, isPublic, ...extra } = params;
  return new LifeErrorClass({
    code,
    message,
    attributes,
    isPublic,
    retryAfterMs,
    extra,
  }) as LifeError<Code>;
}

/**
 * Check whether an unknown value is a LifeError instance.
 * @param error - The unknown value to check.
 * @returns
 */
export function isLifeError(error: unknown): error is LifeErrorUnion {
  return error instanceof LifeErrorClass;
}

// LifeError serialization schema
const serializedLifeErrorSchema = z.object({
  _isLifeError: z.literal(true),
  id: z.string(),
  code: z.string(),
  stack: z.string().optional(),
  message: z.string(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  retryAfterMs: z.number().optional(),
  _extra: z.record(z.string(), z.unknown()),
});

/**
 * Transforms a LifeError into a JSON-serializable object.
 * @param error - The LifeError to serialize.
 * @returns - The JSON-serializable object.
 */
export function serializeLifeError(error: LifeError): Record<string, unknown> {
  if (!(error instanceof LifeErrorClass))
    throw lifeError({
      code: "Validation",
      message: "The provided object is not a LifeError instance.",
    });
  return {
    _isLifeError: true,
    id: error.id,
    code: error.code,
    stack: error.stack,
    message: error.message,
    attributes: error.attributes,
    retryAfterMs: error.retryAfterMs,
    _extra: error._extra,
  };
}

/**
 * Transforms a JSON-serializable object produced by serializeLifeError()
 * back into a LifeError instance.
 * @param obj - The JSON-serializable object.
 * @returns - The LifeError instance.
 */
export function deserializeLifeError(obj: Record<string, unknown>): LifeErrorUnion {
  const { success, data } = serializedLifeErrorSchema.safeParse(obj);
  if (!success)
    throw lifeError({
      code: "Validation",
      message: "The provided object is not a serialized LifeError.",
    });
  const err = lifeError({
    code: data.code as LifeErrorCode,
    message: data.message,
    retryAfterMs: data.retryAfterMs,
    attributes: data.attributes as LifeErrorAttributes,
    ...data._extra,
  });
  // @ts-expect-error - runtime only
  err.id = data.id;
  err.stack = data.stack;
  return err as LifeErrorUnion;
}

/**
 * When a LifeError has to be sent to an external client, this function ensures that the
 * error is obfuscated (free from any sensitive information) by removing the stack,
 * and even all other attributes if the error wasn't explicitly set as public.
 * @param error - The LifeError to make public.
 * @returns - The public LifeError.
 */
export function makePublic<Code extends LifeErrorCode = LifeErrorCode>(
  error: LifeError<Code>,
): LifeError<Code> | LifeErrorUnion {
  // Return raw error in development
  if (process.env.NODE_ENV === "development") return error;

  let publicError: LifeError<Code> | LifeErrorUnion;

  // If the error is already public, just copy it
  if (error.isPublic) {
    publicError = lifeError({
      code: error.code,
      message: error.message,
      attributes: error.attributes,
      retryAfterMs: error.retryAfterMs,
      isPublic: true,
      ...error._extra,
    });
  }

  // Else, create an obfuscated error
  else
    publicError = lifeError({
      code: "Internal",
      isPublic: true,
    });

  // Restore the original id (for telemetry purposes)
  // @ts-expect-error - runtime only
  publicError.id = error.id;

  // Ensure no stack trace is leaked
  publicError.stack = undefined;

  // Return the public error
  return publicError;
}
