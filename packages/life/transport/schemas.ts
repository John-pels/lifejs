import z from "zod";
import type { SerializableValue } from "@/shared/canon";
import * as op from "@/shared/operation";

// RPC message
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
