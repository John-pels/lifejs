import type z from "zod";
import type { Dependencies } from "@/agent/core/types";

// Stores
export type StoreOptions = Record<string, unknown>;

export interface StoreDefinition {
  name: string;
  dependencies: Dependencies;
  schema: z.ZodObject;
  options: StoreOptions;
}

export type StoreDefinitions = StoreDefinition[];

export interface StoresOptions {
  noDefaults?: boolean | string[];
}

export interface StoreAccessor<StoreDef extends StoreDefinition> {
  get: () => z.infer<StoreDef["schema"]>;
  set: (value: z.infer<StoreDef["schema"]>) => void;
}
