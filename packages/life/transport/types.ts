import type z from "zod";
import type { SerializableValue } from "@/shared/canon";
import type { LifeError } from "@/shared/error";
import type * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import type { TransportClientBase } from "./client/base";
import type { rpcRequestSchema, rpcResponseSchema } from "./schemas";

// TransportLike
export type TransportClient = InstanceType<typeof TransportClientBase>;

// Get joinRoom() arguments function
export type TransportGetJoinRoomArgsFunction = (
  roomId: string,
  participantId: string,
) => Promise<op.OperationResult<unknown[]>>;

// RPC request
export type TransportRPCRequest<Input = SerializableValue> = Omit<
  z.infer<typeof rpcRequestSchema>,
  "input"
> & {
  input?: Input;
};

// RPC response
export type TransportRPCResponse<Result = op.OperationResult<SerializableValue>> = Omit<
  z.infer<typeof rpcResponseSchema>,
  "result"
> & {
  result: Result;
};

// RPC message
export type TransportRPCMessage = TransportRPCRequest | TransportRPCResponse;

// RPC procedure
export interface TransportRPCProcedureSchema {
  input?: z.ZodObject;
  output?: z.ZodObject;
}

export interface TransportRPCProcedure<
  Schema extends TransportRPCProcedureSchema = TransportRPCProcedureSchema,
> {
  name: string;
  schema?: Schema;
  execute: (
    input: Schema["input"] extends z.ZodObject ? z.infer<Schema["input"]> : undefined,
  ) => MaybePromise<
    op.OperationResult<Schema["output"] extends z.ZodObject ? z.infer<Schema["output"]> : void>
  >;
}

// Event
export type TransportEvent =
  | { type: "audio"; chunk: Int16Array }
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "error"; error: LifeError };
