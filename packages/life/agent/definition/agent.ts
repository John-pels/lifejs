import z from "zod";
import type { Without } from "@/shared/types";
import type { configSchema } from "../config/schema/server";
import type {
  ActionDefinition,
  ActionsOptions,
  AgentDefinition,
  EffectDefinition,
  EffectsOptions,
  MemoriesOptions,
  MemoryDefinition,
  ScopeDefinition,
  StoreDefinition,
  StoresOptions,
} from "../types";

// Convert a list of definitions builders into a list of definition objects
export const toDefs = <T extends { definition: unknown }[]>(defs: T) =>
  defs.map((def) => def.definition) as T[number]["definition"][];

// Default items definition
export const defaultItems = {
  scope: { schema: z.object({}), hasAccess: () => ({ allowed: true }) },
  memories: [],
  actions: [],
  effects: [],
  stores: [],
  config: {},
};

class AgentBuilder<
  AgentDef extends AgentDefinition,
  Excluded extends keyof AgentBuilder<AgentDefinition> = never,
> {
  definition: AgentDef;

  constructor(definition: AgentDef) {
    this.definition = definition;
  }

  scope<const Schema extends z.ZodObject>(scope: ScopeDefinition<Schema>) {
    const builder = new AgentBuilder({ ...this.definition, scope });
    type NewDefinition = typeof builder.definition & { scope: typeof scope };
    const typed = builder as AgentBuilder<NewDefinition, Excluded | "scope">;
    return typed as Without<typeof typed, Excluded | "scope">;
  }

  memories<Memories extends { definition: MemoryDefinition }[]>(
    memories: Memories,
    options?: MemoriesOptions,
  ) {
    const newMemories = toDefs(memories);
    const builder = new AgentBuilder({
      ...this.definition,
      memories: newMemories,
      memoriesOptions: options,
    });
    type NewDefinition = Without<AgentDef, "memories" | "memoriesOptions"> & {
      memories: typeof newMemories;
      memoriesOptions: typeof options;
    };
    const typed = builder as unknown as AgentBuilder<NewDefinition, Excluded | "memories">;
    return typed as Without<typeof typed, Excluded | "memories">;
  }

  actions<Actions extends { definition: ActionDefinition }[]>(
    actions: Actions,
    options?: ActionsOptions,
  ) {
    const newActions = toDefs(actions);
    const builder = new AgentBuilder({
      ...this.definition,
      actions: newActions,
      actionsOptions: options,
    });
    type NewDefinition = Without<AgentDef, "actions" | "actionsOptions"> & {
      actions: typeof newActions;
      actionsOptions: typeof options;
    };
    const typed = builder as unknown as AgentBuilder<NewDefinition, Excluded | "actions">;
    return typed as Without<typeof typed, Excluded | "actions">;
  }

  stores<Stores extends { definition: StoreDefinition }[]>(
    stores: Stores,
    options?: StoresOptions,
  ) {
    const newStores = toDefs(stores);
    const builder = new AgentBuilder({
      ...this.definition,
      stores: newStores,
      storesOptions: options,
    });
    type NewDefinition = Without<AgentDef, "stores" | "storesOptions"> & {
      stores: typeof newStores;
      storesOptions: typeof options;
    };
    const typed = builder as unknown as AgentBuilder<NewDefinition, Excluded | "stores">;
    return typed as Without<typeof typed, Excluded | "stores">;
  }

  effects<Effects extends { definition: EffectDefinition }[]>(
    effects: Effects,
    options?: EffectsOptions,
  ) {
    const newEffects = toDefs(effects);
    const builder = new AgentBuilder({
      ...this.definition,
      effects: newEffects,
      effectsOptions: options,
    });
    type NewDefinition = Without<AgentDef, "effects" | "effectsOptions"> & {
      effects: typeof newEffects;
      effectsOptions: typeof options;
    };
    const typed = builder as unknown as AgentBuilder<NewDefinition, Excluded | "effects">;
    return typed as Without<typeof typed, Excluded | "effects">;
  }

  plugins<Plugins extends { definition: AgentDefinition }[]>(plugins: Plugins) {
    const pluginsDefinitions = toDefs(plugins);
    const builder = new AgentBuilder({
      ...this.definition,
      memories: [...pluginsDefinitions.flatMap((p) => p.memories), ...this.definition.memories],
      actions: [...pluginsDefinitions.flatMap((p) => p.actions), ...this.definition.actions],
      stores: [...pluginsDefinitions.flatMap((p) => p.stores), ...this.definition.stores],
      effects: [...pluginsDefinitions.flatMap((p) => p.effects), ...this.definition.effects],
    });
    type PluginDefs = Plugins[number]["definition"];
    type NewDefinition = Without<AgentDef, "memories" | "actions" | "stores" | "effects"> & {
      memories: [...PluginDefs["memories"], ...AgentDef["memories"]];
      actions: [...PluginDefs["actions"], ...AgentDef["actions"]];
      stores: [...PluginDefs["stores"], ...AgentDef["stores"]];
      effects: [...PluginDefs["effects"], ...AgentDef["effects"]];
    };
    const typed = builder as unknown as AgentBuilder<NewDefinition, Excluded | "plugins">;
    return typed as Without<typeof typed, Excluded | "plugins">;
  }

  config(config: z.input<typeof configSchema>) {
    const builder = new AgentBuilder({ ...this.definition, config });
    return builder as unknown as Without<typeof builder, Excluded | "config">;
  }
}

export const defineAgent = <Name extends string>(name: Name) =>
  new AgentBuilder({ name, ...defaultItems });
