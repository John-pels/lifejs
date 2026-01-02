import type z from "zod";
import type { Dependencies, DependenciesAccessors } from "@/agent/core/types";

// Actions
export interface ActionOptions {
  disabled?: boolean;
  timeoutMs?: number;
  retries?: number;
  canRun?: {
    inline?: boolean;
    background?: boolean;
    parallel?: boolean;
  };
}

export type ActionExecute<ActionDef extends ActionDefinition = ActionDefinition> = (
  params: {
    input: z.infer<ActionDef["inputSchema"]>;
  } & DependenciesAccessors<ActionDef["dependencies"]>,
) => Promise<{
  output?: z.infer<ActionDef["outputSchema"]>;
  error?: string;
  hint?: string;
}>;

export type ActionLabel<ActionDef extends ActionDefinition = ActionDefinition> =
  | string
  | ((
      params: { input: z.infer<ActionDef["inputSchema"]> } & DependenciesAccessors<
        ActionDef["dependencies"]
      >,
    ) => string);

export type ActionExecuteAccessor<ActionDef extends ActionDefinition> = (
  input: z.infer<ActionDef["inputSchema"]>,
) => Promise<{ output?: z.infer<ActionDef["outputSchema"]>; error?: string; hint?: string }>;

export interface ActionDefinition {
  name: string;
  dependencies: Dependencies;
  description: string;
  inputSchema: z.ZodObject;
  outputSchema: z.ZodObject;
  execute: ActionExecute;
  label: ActionLabel;
  options: ActionOptions;
}

export type ActionDefinitions = ActionDefinition[];

export interface ActionsOptions {
  noDefaults?: boolean | string[];
}

export interface ActionAccessor<ActionDef extends ActionDefinition> {
  execute: ActionExecuteAccessor<ActionDef>;
  lastRun: unknown;
}
