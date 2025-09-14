import z from "zod";
import type { SerializableValue } from "./canon";
import { newId } from "./prefixed-id";

interface LifeErrorCodeDefinition {
  retriable: boolean;
  defaultMessage: string;
  httpEquivalent: number;
  extraSchema?: z.ZodObject<Record<string, z.ZodType<SerializableValue>>>;
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
  },
} as const satisfies Record<string, LifeErrorCodeDefinition>;

export type LifeErrorCode = keyof typeof lifeErrorCodes;

export type LifeErrorAttributes = Record<string, SerializableValue>;

export class LifeError extends Error {
  readonly id: string;
  readonly code: LifeErrorCode;
  readonly attributes: LifeErrorAttributes;
  readonly retriable: boolean;
  readonly retryAfterMs?: number;
  readonly httpEquivalent: number;
  readonly isPublic: boolean;
  readonly _extra: z.output<z.ZodObject<Record<string, z.ZodType<SerializableValue>>>>;

  constructor({
    id,
    code,
    message,
    attributes,
    retryAfterMs,
    isPublic = false,
    stack,
    ...extra
  }: {
    id?: string;
    code: LifeErrorCode;
    message?: string;
    attributes?: LifeErrorAttributes;
    retryAfterMs?: number;
    isPublic?: boolean;
    stack?: string;
  } & z.output<z.ZodObject<Record<string, z.ZodType<SerializableValue>>>>) {
    const definition = lifeErrorCodes[code];
    super(message ?? definition.defaultMessage);
    this.name = "LifeError";
    this.id = id ?? newId("error");
    this.code = code;
    this.retriable = definition.retriable;
    this.attributes = attributes ?? {};
    this.retryAfterMs = retryAfterMs;
    this.httpEquivalent = definition.httpEquivalent;
    this.isPublic = isPublic;
    if (stack) this.stack = stack;
    this._extra = extra;
    // @ts-expect-error - runtime only
    for (const key of Object.keys(extra)) this[key] = extra[key];
    // Clean stack capture
    if (Error.captureStackTrace) Error.captureStackTrace(this, LifeError);
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

export type LifeErrorParams<Code extends keyof typeof lifeErrorCodes> = {
  code: Code;
  message?: string;
  attributes?: LifeErrorAttributes;
  retryAfterMs?: number;
  isPublic?: boolean;
} & ("extraSchema" extends keyof (typeof lifeErrorCodes)[Code]
  ? (typeof lifeErrorCodes)[Code]["extraSchema"] extends z.ZodObject<
      Record<string, z.ZodType<SerializableValue>>
    >
    ? z.output<(typeof lifeErrorCodes)[Code]["extraSchema"]>
    : // biome-ignore lint/complexity/noBannedTypes: fine here
      {}
  : // biome-ignore lint/complexity/noBannedTypes: fine here
    {});

export function lifeError<Code extends keyof typeof lifeErrorCodes>(params: LifeErrorParams<Code>) {
  const { code, message, attributes, retryAfterMs, isPublic, ...extra } = params;
  return new LifeError({
    code,
    message,
    attributes,
    retryAfterMs,
    isPublic,
    ...extra,
  });
}

export function isLifeError(error: unknown): error is LifeError {
  return error instanceof LifeError;
}

const serializedLifeErrorSchema = z.object({
  _isLifeError: z.literal(true),
  id: z.string(),
  code: z.string(),
  message: z.string(),
  retryAfterMs: z.number().optional(),
  stack: z.string().optional(),
  attributes: z.record(z.string(), z.unknown()).optional(),
  _extra: z.record(z.string(), z.unknown()),
});

export function serializeLifeError(error: LifeError): Record<string, unknown> {
  if (!(error instanceof LifeError))
    throw new LifeError({
      code: "Validation",
      message: "The provided object is not a LifeError instance.",
    });
  return {
    _isLifeError: true,
    id: error.id,
    code: error.code,
    message: error.message,
    retryAfterMs: error.retryAfterMs,
    stack: error.stack,
    attributes: error.attributes,
    _extra: error._extra,
  };
}

export function deserializeLifeError(obj: Record<string, unknown>): LifeError {
  if (!obj._isLifeError)
    throw new LifeError({
      code: "Validation",
      message: "The provided object is not a serialized LifeError.",
    });
  const { success, data } = serializedLifeErrorSchema.safeParse(obj);
  if (!success)
    throw new LifeError({
      code: "Validation",
      message: "The provided object is not a serialized LifeError.",
    });
  return new LifeError({
    id: data.id,
    code: data.code as LifeErrorCode,
    message: data.message,
    retryAfterMs: data.retryAfterMs,
    stack: data.stack,
    attributes: data.attributes as LifeErrorAttributes,
    ...data._extra,
  });
}

export function makePublic(error: LifeError) {
  // Ignore in development
  if (process.env.NODE_ENV === "development") return error;

  // Avoid leaking stack traces in production
  error.stack = undefined;

  // If the error is already public, return it
  if (error.isPublic) return error;

  // Else, create an obfuscated error
  const internalError = new LifeError({
    id: error.id,
    code: "Internal",
    isPublic: true,
  });
  internalError.stack = undefined;

  // Return the obfuscated error
  return internalError;
}
