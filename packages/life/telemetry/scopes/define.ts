import type z from "zod";
import type { TelemetryScopeDefinition } from "../types";

export function defineScopes<const Schemas extends Record<string, z.ZodObject>>(
  scopes: {
    [K in keyof Schemas]: TelemetryScopeDefinition<Schemas[K]>;
  },
) {
  return scopes;
}
