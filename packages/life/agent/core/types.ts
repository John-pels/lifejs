import type z from "zod";
import type { EOUProviderBase } from "@/models/eou/providers/base";
import type { LLMProvider } from "@/models/llm/provider";
import type { STTProviderBase } from "@/models/stt/providers/base";
import type { TTSProviderBase } from "@/models/tts/base";
import type { VADProviderBase } from "@/models/vad/providers/base";
import type { agentServerConfigSchema } from "../config/server";
import type { ActionDefinition } from "../primitives/actions/types";
import type { EffectDefinition } from "../primitives/effects/types";
import type { MemoryDefinition } from "../primitives/memories/types";
import type { StoreDefinition } from "../primitives/stores/types";
import type { statusSchema } from "../runtime/context";

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

// Memories
export type MemoriesDefinition = MemoryDefinition[];

export interface MemoriesOptions {
  noDefaults?: boolean | string[];
}

// Effects
export type EffectDefinitions = EffectDefinition[];

export interface EffectsOptions {
  noDefaults?: boolean | string[];
}

// Actions
export type ActionsDefinition = ActionDefinition[];

export interface ActionsOptions {
  noDefaults?: boolean | string[];
}

// Stores
export type StoresDefinition = StoreDefinition[];

export interface StoresOptions {
  noDefaults?: boolean | string[];
}

// Agent
export interface AgentDefinition {
  name: string;
  scope: ScopeDefinition;
  memories: MemoriesDefinition;
  memoriesOptions?: MemoriesOptions;
  actions: ActionsDefinition;
  actionsOptions?: ActionsOptions;
  effects: EffectDefinitions;
  effectsOptions?: EffectsOptions;
  stores: StoresDefinition;
  storesOptions?: StoresOptions;
  config: z.input<typeof agentServerConfigSchema>;
}
