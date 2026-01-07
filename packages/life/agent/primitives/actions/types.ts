import type z from "zod";
import type { EventEmitter } from "@/shared/event-emitter";
import type { MaybePromise } from "@/shared/types";
import type { PrimitiveAccessors, PrimitiveDefinitions } from "../types";
import type { emitterDefinition } from "./emitter";

// Options
export interface ActionOptions {
  timeoutMs?: number;
  retries?: number | false;
  canRun?: {
    inline?: boolean;
    background?: boolean;
    parallel?: boolean;
  };
}

// Execute
export type ActionExecute<ActionDef extends ActionDefinition = ActionDefinition> = (
  params: {
    input: z.infer<ActionDef["input"]>;
  } & PrimitiveAccessors<PrimitiveDefinitions>,
) => MaybePromise<{
  output?: z.infer<ActionDef["output"]>;
  error?: string;
  hint?: string;
}>;

// Accessor
export type ActionExecuteAccessor<ActionDef extends ActionDefinition> = (
  input: z.infer<ActionDef["input"]>,
) => Promise<{ output?: z.infer<ActionDef["output"]>; error?: string; hint?: string }>;

// Definition
export interface ActionDefinition {
  name: string;
  description: string;
  input: z.ZodObject;
  output: z.ZodObject;
  execute: ActionExecute;
  options: ActionOptions;
  dependencies: PrimitiveDefinitions;
}

// Accessor
export interface ActionAccessor<ActionDef extends ActionDefinition> {
  execute: ActionExecuteAccessor<ActionDef>;
  lastRun: unknown;
  on: EventEmitter<typeof emitterDefinition>["on"];
  once: EventEmitter<typeof emitterDefinition>["once"];
}
