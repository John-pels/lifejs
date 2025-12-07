import z from "zod";
import type { SerializableValue } from "./canon";
import { newId } from "./id";

// Codes
interface LifeErrorCodeDefinition {
  retriable: boolean;
  defaultMessage: string;
  httpEquivalent: number;
}

export const lifeErrorCodes = {
  /**
   * Used when the user sends or the server returns invalid data.
   */
  Validation: {
    retriable: false,
    defaultMessage: "Invalid data provided.",
    httpEquivalent: 400,
  },
  /**
   * Used when the user is not authorized to access a resource
   */
  Forbidden: {
    retriable: false,
    defaultMessage: "Not allowed to access this resource.",
    httpEquivalent: 403,
  },
  /**
   * Used when an operation took too long and timed out.
   */
  Timeout: {
    retriable: true,
    defaultMessage: "Operation timed out.",
    httpEquivalent: 504,
  },
  /**
   * Used when the user has exceeded the rate limit for a resource.
   */
  RateLimit: {
    retriable: true,
    defaultMessage: "Rate limit exceeded.",
    httpEquivalent: 429,
  },
  /**
   * Used when a resource was not found or missing.
   */
  NotFound: {
    retriable: false,
    defaultMessage: "Resource not found.",
    httpEquivalent: 404,
  },
  /**
   * Used when an operation is about to conflict with another.
   * E.g., a version mismatch, a unique constraint violation, etc.
   */
  Conflict: {
    retriable: false,
    defaultMessage: "Operation conflicted.",
    httpEquivalent: 409,
  },
  /**
   * Used when an upstream service or resource fails.
   * E.g., a database connection error, an OpenAI API downtime, etc.
   */
  Upstream: {
    retriable: true,
    defaultMessage: "Upstream error.",
    httpEquivalent: 502,
  },
  /**
   * Used when an unexpected error is thrown.
   */
  Unknown: {
    retriable: false,
    defaultMessage: "Unknown error.",
    httpEquivalent: 500,
  },
  /**
   * Used to obfuscate internal errors publicly.
   * Prevents leaking sensitive informations to public consumers.
   */
  Internal: {
    retriable: true,
    defaultMessage: "Internal error.",
    httpEquivalent: 500,
  },
} as const satisfies Record<string, LifeErrorCodeDefinition>;

export type LifeErrorCode = keyof typeof lifeErrorCodes;

// Parameters
export interface LifeErrorParameters<Code extends LifeErrorCode> {
  code: Code;
  message?: string;
  attributes?: LifeErrorAttributes;
  retryAfterMs?: number;
  isPublic?: boolean;
  cause?: unknown;
}

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
   * The suggested time (in ms) to wait before retrying the operation that caused the error.
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

  constructor({
    code,
    message,
    attributes,
    retryAfterMs,
    cause,
    isPublic = false,
  }: LifeErrorParameters<LifeErrorCode>) {
    const definition = lifeErrorCodes[code];
    super(message ?? definition.defaultMessage);
    this.code = code;
    this.retriable = definition.retriable;
    this.attributes = attributes ?? {};
    this.retryAfterMs = retryAfterMs;
    this.httpEquivalent = definition.httpEquivalent;
    this.isPublic = isPublic;
    this.cause = cause;

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
      cause: this.cause,
    };
  }
}

/**
 * Error emitted by the Life.js framework.
 * Check attributes documentation for more information.
 */
export type LifeError<Code extends LifeErrorCode = LifeErrorCode> = LifeErrorClass & {
  code: Code;
}; // & z.output<(typeof lifeErrorCodes)[Code]["extraSchema"]>;

/**
 * Union of all LifeError types.
 */
export type LifeErrorUnion<Code extends LifeErrorCode = LifeErrorCode> = Code extends LifeErrorCode
  ? LifeError<Code>
  : never;

/**
 * Creates a new LifeError instance.
 * @param params
 * @returns
 */
export function lifeError<Code extends LifeErrorCode>(params: LifeErrorParameters<Code>) {
  // If the cause is a LifeError and it's an "Unknown" error, use the cause instead
  if (params.code === "Unknown" && isLifeError(params.cause)) {
    return params.cause as LifeError<Code>;
  }
  // Else, create a new LifeError instance
  return new LifeErrorClass(params) as LifeError<Code>;
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
  attributes: z.object().optional(),
  retryAfterMs: z.number().optional(),
  isPublic: z.boolean().optional(),
  cause: z.any().optional(),
});

/**
 * Transforms a LifeError into a JSON-serializable object.
 * @param error - The LifeError to serialize.
 * @returns - The JSON-serializable object.
 */
export function lifeErrorToObject(error: LifeError): Record<string, unknown> {
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
    cause: error.cause,
  };
}

/**
 * Transforms a JSON-serializable object produced by serializeLifeError()
 * back into a LifeError instance.
 * @param obj - The JSON-serializable object.
 * @returns - The LifeError instance.
 */
export function lifeErrorFromObject(obj: Record<string, unknown>): LifeErrorUnion {
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
    cause: data.cause,
    isPublic: data.isPublic,
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
export function obfuscateLifeError<Code extends LifeErrorCode = LifeErrorCode>(
  error: LifeError<Code>,
): LifeErrorUnion {
  // Return raw error in development
  if (process.env.NODE_ENV === "development") return error as LifeErrorUnion;

  let publicError: LifeError;

  // If the error is already public, just clone it to avoid mutating the original error
  if (error.isPublic) {
    publicError = lifeError({
      code: error.code,
      message: error.message,
      attributes: error.attributes,
      retryAfterMs: error.retryAfterMs,
      cause: error.cause,
    });
  }

  // Else, create an obfuscated error
  else publicError = lifeError({ code: "Internal" });

  // Set the error as public
  // @ts-expect-error - runtime only
  publicError.isPublic = true;

  // Restore the original id (for telemetry purposes)
  // @ts-expect-error - runtime only
  publicError.id = error.id;

  // Ensure no stack trace is leaked
  publicError.stack = undefined;

  // Return the public error
  return publicError as LifeErrorUnion;
}
