import type { HandlerDefinition, HandlerStateDefinition } from "../types";

// Helper to define a handler with precise typesafety.
export const defineHandler = <
  Name extends string,
  StateDef extends HandlerStateDefinition,
  Output = unknown,
>(
  definition: HandlerDefinition<Name, StateDef, Output>,
) => definition;
