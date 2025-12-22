import z from "zod";
import type { Override, Without } from "@/shared/types";
import type { configSchema } from "./config/schema/server";
import type {
  ActionDefinition,
  ActionExecute,
  ActionLabel,
  ActionOptions,
  ActionsOptions,
  AgentDefinition,
  Dependencies,
  EffectDefinition,
  EffectOnMount,
  EffectOptions,
  EffectsOptions,
  MemoriesOptions,
  MemoryDefinition,
  MemoryOptions,
  MemoryOutput,
  ScopeDefinition,
  StoreDefinition,
  StoreOptions,
  StoresOptions,
} from "./types";

// Convert a list of definitions builders into a list of definition objects
const toDefs = <T extends { definition: unknown }[]>(defs: T) =>
  defs.map((def) => def.definition) as T[number]["definition"][];

// Default items definition
const defaultItems = {
  scope: { schema: z.object({}), hasAccess: () => ({ allowed: true }) },
  memories: [],
  actions: [],
  effects: [],
  stores: [],
  config: {},
};

// Memories
class MemoryBuilder<
  MemoryDef extends MemoryDefinition,
  Excluded extends keyof MemoryBuilder<MemoryDef> = never,
> {
  definition: MemoryDef;
  constructor(definition: MemoryDef) {
    this.definition = definition;
  }
  dependencies<Deps extends Dependencies>(dependencies: Deps) {
    const builder = new MemoryBuilder({ ...this.definition, dependencies });
    type NewDefinition = Override<(typeof builder)["definition"], "dependencies", Deps>;
    const typed = builder as MemoryBuilder<NewDefinition, Excluded | "dependencies">;
    return typed as Without<typeof typed, Excluded | "dependencies">;
  }
  output(output: MemoryOutput<MemoryDef["dependencies"]>) {
    const builder = new MemoryBuilder({ ...this.definition, output });
    const typed = builder as MemoryBuilder<(typeof builder)["definition"], Excluded | "output">;
    return typed as Without<typeof typed, Excluded | "output">;
  }
  options(options: MemoryOptions) {
    const builder = new MemoryBuilder({ ...this.definition, options });
    const typed = builder as MemoryBuilder<(typeof builder)["definition"], Excluded | "options">;
    return typed as Without<typeof typed, Excluded | "options">;
  }
}

export const defineMemory = <Name extends string>(name: Name) =>
  new MemoryBuilder({ name, dependencies: [], output: [], options: {} });

// Actions
class ActionsBuilder<
  ActionDef extends ActionDefinition,
  Excluded extends keyof ActionsBuilder<ActionDef> = never,
> {
  definition: ActionDef;
  constructor(definition: ActionDef) {
    this.definition = definition;
  }
  dependencies<Deps extends Dependencies>(dependencies: Deps) {
    const builder = new ActionsBuilder({ ...this.definition, dependencies });
    type NewDefinition = Override<(typeof builder)["definition"], "dependencies", Deps>;
    const typed = builder as ActionsBuilder<NewDefinition, Excluded | "dependencies">;
    return typed as Without<typeof typed, Excluded | "dependencies">;
  }
  description(description: string) {
    const builder = new ActionsBuilder({ ...this.definition, description });
    const typed = builder as ActionsBuilder<ActionDef, Excluded | "description">;
    return typed as Without<typeof typed, Excluded | "description">;
  }
  input<Schema extends z.ZodObject>(input: Schema) {
    const builder = new ActionsBuilder({ ...this.definition, input });
    type NewDefinition = Override<(typeof builder)["definition"], "input", Schema>;
    const typed = builder as ActionsBuilder<NewDefinition, Excluded | "input">;
    return typed as Without<typeof typed, Excluded | "input">;
  }
  output<Schema extends z.ZodObject>(output: Schema) {
    const builder = new ActionsBuilder({ ...this.definition, output });
    type NewDefinition = Override<(typeof builder)["definition"], "output", Schema>;
    const typed = builder as ActionsBuilder<NewDefinition, Excluded | "output">;
    return typed as Without<typeof typed, Excluded | "output">;
  }
  label(label: ActionLabel<ActionDef>) {
    const builder = new ActionsBuilder({ ...this.definition, label });
    const typed = builder as ActionsBuilder<ActionDef, Excluded | "label">;
    return typed as Without<typeof typed, Excluded | "label">;
  }
  execute(execute: ActionExecute<ActionDef>) {
    const builder = new ActionsBuilder({ ...this.definition, execute });
    const typed = builder as ActionsBuilder<(typeof builder)["definition"], Excluded | "execute">;
    return typed as Without<typeof typed, Excluded | "execute">;
  }
  options(options: ActionOptions) {
    const builder = new ActionsBuilder({ ...this.definition, options });
    const typed = builder as ActionsBuilder<(typeof builder)["definition"], Excluded | "options">;
    return typed as Without<typeof typed, Excluded | "options">;
  }
}

export const defineAction = <Name extends string>(name: Name) =>
  new ActionsBuilder({
    name,
    dependencies: [],
    description: "",
    input: z.object({}),
    output: z.object({}),
    execute: async () => ({ output: {} }),
    options: {},
  });

// Effects
class EffectsBuilder<
  EffectDef extends EffectDefinition,
  Excluded extends keyof EffectsBuilder<EffectDef> = never,
> {
  definition: EffectDef;
  constructor(definition: EffectDef) {
    this.definition = definition;
  }
  dependencies<Deps extends Dependencies>(dependencies: Deps) {
    const builder = new EffectsBuilder({ ...this.definition, dependencies });
    type NewDefinition = Override<(typeof builder)["definition"], "dependencies", Deps>;
    const typed = builder as EffectsBuilder<NewDefinition, Excluded | "dependencies">;
    return typed as Without<typeof typed, Excluded | "dependencies">;
  }
  onMount(onMount: EffectOnMount<EffectDef["dependencies"]>) {
    const builder = new EffectsBuilder({ ...this.definition, onMount });
    type NewDefinition = Override<
      (typeof builder)["definition"],
      "onMount",
      EffectOnMount<EffectDef["dependencies"]>
    >;
    const typed = builder as EffectsBuilder<NewDefinition, Excluded | "onMount">;
    return typed as Without<typeof typed, Excluded | "onMount">;
  }
  options(options: EffectOptions) {
    const builder = new EffectsBuilder({ ...this.definition, options });
    const typed = builder as EffectsBuilder<(typeof builder)["definition"], Excluded | "options">;
    return typed as Without<typeof typed, Excluded | "options">;
  }
}

export const defineEffect = <Name extends string>(name: Name) =>
  new EffectsBuilder({ name, dependencies: [], onMount: async () => void 0, options: {} });

// Stores
class StoresBuilder<
  StoreDef extends StoreDefinition,
  Excluded extends keyof StoresBuilder<StoreDef> = never,
> {
  definition: StoreDef;
  constructor(definition: StoreDef) {
    this.definition = definition;
  }
  dependencies<Deps extends Dependencies>(dependencies: Deps) {
    const builder = new StoresBuilder({ ...this.definition, dependencies });
    type NewDefinition = Override<(typeof builder)["definition"], "dependencies", Deps>;
    const typed = builder as StoresBuilder<NewDefinition, Excluded | "dependencies">;
    return typed as Without<typeof typed, Excluded | "dependencies">;
  }
  schema<Schema extends z.ZodObject>(schema: Schema) {
    const builder = new StoresBuilder({ ...this.definition, schema });
    type NewDefinition = Override<(typeof builder)["definition"], "schema", Schema>;
    const typed = builder as StoresBuilder<NewDefinition, Excluded | "schema">;
    return typed as Without<typeof typed, Excluded | "schema">;
  }
  options(options: StoreOptions) {
    const builder = new StoresBuilder({ ...this.definition, options });
    const typed = builder as StoresBuilder<(typeof builder)["definition"], Excluded | "options">;
    return typed as Without<typeof typed, Excluded | "options">;
  }
}

export const defineStore = <Name extends string>(name: Name) =>
  new StoresBuilder({ name, dependencies: [], schema: z.object({}), options: {} });

// Plugins
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

// Agent
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
