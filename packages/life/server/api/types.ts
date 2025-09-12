import z from "zod";
import type { AsyncQueue } from "@/shared/async-queue";
import type * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import type { LifeApi } from ".";

// - Definition
export type LifeApiCallDefinition = {
  type: "call";
  protected: boolean;
  inputDataSchema?: z.ZodSchema;
  outputDataSchema?: z.ZodSchema;
};

export type LifeApiCastDefinition = {
  type: "cast";
  protected: boolean;
  inputDataSchema?: z.ZodSchema;
  outputDataSchema?: never;
};

export type LifeApiStreamDefinition = {
  type: "stream";
  protected: boolean;
  inputDataSchema?: z.ZodSchema;
  outputDataSchema?: z.ZodSchema;
};

export type LifeApiHandlerDefinition =
  | LifeApiCallDefinition
  | LifeApiCastDefinition
  | LifeApiStreamDefinition;

export type LifeApiDefinition = Record<string, LifeApiHandlerDefinition>;

// - Input
export const lifeApiBaseInputSchema = z.object({
  handlerId: z.string(),
  serverToken: z.string().optional(),
  data: z.any().optional(),
});
export type LifeApiInputBase = z.infer<typeof lifeApiBaseInputSchema>;

export const lifeApiCallInputSchema = lifeApiBaseInputSchema;
export type LifeApiCallInput = z.infer<typeof lifeApiCallInputSchema>;

export const lifeApiCastInputSchema = lifeApiBaseInputSchema;
export type LifeApiCastInput = z.infer<typeof lifeApiCastInputSchema>;

export const lifeApiStreamInputSchema = lifeApiBaseInputSchema.extend({
  subscriptionId: z.string(),
  action: z.enum(["subscribe", "unsubscribe"]),
});
export type LifeApiStreamInput = z.infer<typeof lifeApiStreamInputSchema>;

// - Input Data
export type LifeApiInputData<Def extends LifeApiHandlerDefinition> =
  Def["inputDataSchema"] extends z.ZodSchema ? z.infer<Def["inputDataSchema"]> : never;

// - Output
export type LifeApiOutput<Def extends LifeApiHandlerDefinition> = Def extends
  | LifeApiCallDefinition
  | LifeApiStreamDefinition
  ? Def["outputDataSchema"] extends z.ZodSchema
    ? op.OperationResult<z.infer<Def["outputDataSchema"]>>
    : op.OperationResult<void>
  : op.OperationResult<void>;

// - 'call' handler
export type LifeApiCallHandler<Def extends LifeApiCallDefinition> = {
  onCall: (params: {
    api: LifeApi;
    data: LifeApiInputData<Def>;
    request: Request;
  }) => MaybePromise<LifeApiOutput<Def>>;
};

// - 'cast' handler
export type LifeApiCastHandler<Def extends LifeApiCastDefinition> = {
  onCast: (params: {
    api: LifeApi;
    data: LifeApiInputData<Def>;
  }) => MaybePromise<LifeApiOutput<Def>>;
};

// - 'stream' handler
export type LifeApiStreamSendFunction<Def extends LifeApiStreamDefinition> = (
  data: LifeApiOutput<Def>,
) => void;

export type LifeApiStreamQueueEvent<Def extends LifeApiStreamDefinition> =
  | {
      action: "add";
      subscriptionId: string;
      data: LifeApiInputData<Def>;
      send: LifeApiStreamSendFunction<Def>;
    }
  | {
      action: "remove";
      subscriptionId: string;
    };

export type LifeApiStreamHandler<Def extends LifeApiStreamDefinition> = {
  onStart: (params: {
    api: LifeApi;
    queue: AsyncQueue<LifeApiStreamQueueEvent<Def>>;
  }) => MaybePromise<void>;
};

// - Handlers
export type LifeApiHandler<Def extends LifeApiHandlerDefinition> = Def extends LifeApiCallDefinition
  ? LifeApiCallHandler<Def>
  : Def extends LifeApiCastDefinition
    ? LifeApiCastHandler<Def>
    : Def extends LifeApiStreamDefinition
      ? LifeApiStreamHandler<Def>
      : never;

export type LifeApiHandlers<Defs extends LifeApiDefinition> = {
  [K in keyof Defs]: LifeApiHandler<Defs[K]>;
};
