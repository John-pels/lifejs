import z from "zod";
import type { SerializableValue } from "@/shared/canon";
import * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";

// RPC messages
export const rpcRequestSchema = z.object({
  type: z.literal("request"),
  id: z.string(),
  name: z.string(),
  input: z.unknown().optional(),
});

export const rpcResponseSchema = z.object({
  type: z.literal("response"),
  id: z.string(),
  result: op.resultSchema.transform((result) => result as op.OperationResult<SerializableValue>),
});

export const rpcMessageSchema = z.discriminatedUnion("type", [rpcRequestSchema, rpcResponseSchema]);

export type RPCRequest<Input = SerializableValue> = Omit<
  z.infer<typeof rpcRequestSchema>,
  "input"
> & {
  input?: Input;
};

export type RPCResponse<Result = op.OperationResult<SerializableValue>> = Omit<
  z.infer<typeof rpcResponseSchema>,
  "result"
> & {
  result: Result;
};

export type RPCMessage = RPCRequest | RPCResponse;

// RPC procedure
export interface RPCProcedureSchema {
  input?: z.ZodObject;
  output?: z.ZodObject;
}
export interface RPCProcedure<Schema extends RPCProcedureSchema = RPCProcedureSchema> {
  name: string;
  schema?: Schema;
  execute: (
    input: Schema["input"] extends z.ZodObject ? z.infer<Schema["input"]> : undefined,
  ) => MaybePromise<
    op.OperationResult<Schema["output"] extends z.ZodObject ? z.infer<Schema["output"]> : void>
  >;
}
