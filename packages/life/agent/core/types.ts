import type z from "zod";
import type { EOUProviderBase } from "@/models/eou/providers/base";
import type { LLMProvider } from "@/models/llm/provider";
import type { STTProviderBase } from "@/models/stt/providers/base";
import type { TTSProviderBase } from "@/models/tts/base";
import type { VADProviderBase } from "@/models/vad/providers/base";
import type { ActionDefinition } from "../features/actions/types";
import type { MemoryDefinition } from "../features/memories/types";
import type { StoreDefinition } from "../features/stores/types";
import type { configSchema } from "./agent/config/schema/server";
import type { statusSchema } from "./agent/server/runtime/context";

// Status
export type AgentStatus = z.infer<typeof statusSchema>;

// Models
export interface AgentModels {
  llm: InstanceType<typeof LLMProvider>;
  eou: InstanceType<typeof EOUProviderBase>;
  stt: InstanceType<typeof STTProviderBase>;
  tts: InstanceType<typeof TTSProviderBase>;
  vad: InstanceType<typeof VADProviderBase>;
}

// Scope
export interface ScopeDefinition<Schema extends z.ZodObject = z.ZodObject> {
  schema: Schema;
  hasAccess: (params: {
    input: z.infer<Schema>;
  }) => { allowed: true } | { allowed: false; reason?: string };
}

// Dependencies
type DependencyDefinition = MemoryDefinition | ActionDefinition | StoreDefinition;

export interface Dependency {
  definition: DependencyDefinition;
}

export type Dependencies = Dependency[];

export interface DependenciesAccessors<Deps extends Dependencies> {
  memories: {
    [Dep in Deps[number] as Dep["definition"] extends MemoryDefinition
      ? Dep["definition"]["name"]
      : never]: MemoryAccessor;
  };
  actions: {
    [Dep in Deps[number] as Dep["definition"] extends ActionDefinition
      ? Dep["definition"]["name"]
      : never]: ActionAccessor<
      Dep["definition"] extends ActionDefinition ? Dep["definition"] : never
    >;
  };
  stores: {
    [Dep in Deps[number] as Dep["definition"] extends StoreDefinition
      ? Dep["definition"]["name"]
      : never]: StoreAccessor<
      Dep["definition"] extends StoreDefinition ? Dep["definition"] : never
    >;
  };
}

// Agent
export interface AgentDefinition {
  name: string;
  scope: ScopeDefinition;
  memories: MemoryDefinitions;
  memoriesOptions?: MemoriesOptions;
  actions: ActionDefinitions;
  actionsOptions?: ActionsOptions;
  effects: EffectDefinitions;
  effectsOptions?: EffectsOptions;
  stores: StoreDefinitions;
  storesOptions?: StoresOptions;
  config: z.input<typeof configSchema>;
}
