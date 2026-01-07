import type { ActionDefinition } from "./actions/types";
import type { EffectDefinition } from "./effects/types";
import type { MemoryDefinition } from "./memories/types";
import type { StoreDefinition } from "./stores/types";

// Symbol
export const defSymbol: unique symbol = Symbol("DEFINITION");

// Definition
export type PrimitiveDefinition =
  | MemoryDefinition
  | ActionDefinition
  | StoreDefinition
  | EffectDefinition;

export type PrimitiveDefinitions = PrimitiveDefinition[];

// Dependencies
export type PrimitivesDependencies = { [defSymbol]: PrimitiveDefinition }[];
export type PrimitivesDependenciesToDefinitions<T extends PrimitivesDependencies> = {
  [K in keyof T]: T[K][typeof defSymbol];
};

// Accessors
// biome-ignore lint/correctness/noUnusedVariables: a
export type PrimitiveAccessors<Definitions extends PrimitiveDefinitions> = {};
//   memories: {
//     [Dep in Dependencies[number] as Dep["definition"] extends MemoryDefinition
//       ? Dep["definition"]["name"]
//       : never]: MemoryAccessor;
//   };
//   actions: {
//     [Dep in Dependencies[number] as Dep["definition"] extends ActionDefinition
//       ? Dep["definition"]["name"]
//       : never]: ActionAccessor<
//       Dep["definition"] extends ActionDefinition ? Dep["definition"] : never
//     >;
//   };
//   stores: {
//     [Dep in Dependencies[number] as Dep["definition"] extends StoreDefinition
//       ? Dep["definition"]["name"]
//       : never]: StoreAccessor<
//       Dep["definition"] extends StoreDefinition ? Dep["definition"] : never
//     >;
//   };
// test: string;
