import type { Without } from "@/shared/types";
import type {
  ActionDefinition,
  AgentDefinition,
  EffectDefinition,
  MemoryDefinition,
  StoreDefinition,
} from "../types";
import { defaultItems, toDefs } from "./agent";

class PluginBuilder<
  AgentDef extends AgentDefinition,
  Excluded extends keyof PluginBuilder<AgentDefinition> = never,
> {
  definition: AgentDef;

  constructor(definition: AgentDef) {
    this.definition = definition;
  }

  memories<Memories extends { definition: MemoryDefinition }[]>(memories: Memories) {
    const newMemories = toDefs(memories);
    const builder = new PluginBuilder({ ...this.definition, memories: newMemories });
    type NewDefinition = Without<AgentDef, "memories"> & { memories: typeof newMemories };
    const typed = builder as unknown as PluginBuilder<NewDefinition, Excluded | "memories">;
    return typed as Without<typeof typed, Excluded | "memories">;
  }

  actions<Actions extends { definition: ActionDefinition }[]>(actions: Actions) {
    const newActions = toDefs(actions);
    const builder = new PluginBuilder({ ...this.definition, actions: newActions });
    type NewDefinition = Without<AgentDef, "actions"> & { actions: typeof newActions };
    const typed = builder as unknown as PluginBuilder<NewDefinition, Excluded | "actions">;
    return typed as Without<typeof typed, Excluded | "actions">;
  }

  effects<Effects extends { definition: EffectDefinition }[]>(effects: Effects) {
    const newEffects = toDefs(effects);
    const builder = new PluginBuilder({ ...this.definition, effects: newEffects });
    type NewDefinition = Without<AgentDef, "effects"> & { effects: typeof newEffects };
    const typed = builder as unknown as PluginBuilder<NewDefinition, Excluded | "effects">;
    return typed as Without<typeof typed, Excluded | "effects">;
  }

  stores<Stores extends { definition: StoreDefinition }[]>(stores: Stores) {
    const newStores = toDefs(stores);
    const builder = new PluginBuilder({ ...this.definition, stores: newStores });
    type NewDefinition = Without<AgentDef, "stores"> & { stores: typeof newStores };
    const typed = builder as unknown as PluginBuilder<NewDefinition, Excluded | "stores">;
    return typed as Without<typeof typed, Excluded | "stores">;
  }

  plugins<Plugins extends { definition: AgentDefinition }[]>(plugins: Plugins) {
    const pluginsDefinitions = toDefs(plugins);
    const builder = new PluginBuilder({
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
    const typed = builder as unknown as PluginBuilder<NewDefinition, Excluded | "plugins">;
    return typed as Without<typeof typed, Excluded | "plugins">;
  }
}

export const definePlugin = <Name extends string>(name: Name) =>
  new PluginBuilder({ name, ...defaultItems });
