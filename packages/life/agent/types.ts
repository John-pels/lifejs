import type z from "zod";
import type { EOUProviderBase } from "@/models/eou/providers/base";
import type { LLMProvider } from "@/models/llm/provider";
import type { STTProviderBase } from "@/models/stt/providers/base";
import type { TTSProviderBase } from "@/models/tts/base";
import type { VADProviderBase } from "@/models/vad/providers/base";
import type * as op from "@/shared/operation";
import type { Any, MaybePromise, Without } from "@/shared/types";
import type { TelemetrySpanHandle } from "@/telemetry/types";
import type { clientConfigSchema } from "./config/schema/client";
import type { configSchema } from "./config/schema/server";
import type { CreateMessageInput, Message } from "./messages";
import type { AgentServer } from "./server/agent";
import type { contextDefinition, statusSchema } from "./server/runtime/context";
import type { eventSchema, eventSourceSchema, eventsDefinition } from "./server/runtime/events";
import type { handlersDefinition } from "./server/runtime/handlers";

// Status
export type Status = z.infer<typeof statusSchema>;

// Models
export interface Models {
  llm: InstanceType<typeof LLMProvider>;
  eou: InstanceType<typeof EOUProviderBase>;
  stt: InstanceType<typeof STTProviderBase>;
  tts: InstanceType<typeof TTSProviderBase>;
  vad: InstanceType<typeof VADProviderBase>;
}

// Config
export type Config<
  T extends "server" | "client" = "server",
  K extends "input" | "output" = "output",
> = T extends "server"
  ? T extends "input"
    ? z.input<typeof configSchema>
    : z.output<typeof configSchema>
  : T extends "client"
    ? K extends "input"
      ? z.input<typeof clientConfigSchema>
      : z.output<typeof clientConfigSchema>
    : never;

// Context
export type ContextDefinition = z.ZodObject;

export type Context<T extends "input" | "output" = "output"> = T extends "input"
  ? z.input<typeof contextDefinition>
  : z.output<typeof contextDefinition>;

export interface ContextListener {
  id: string;
  selector: (context: Any) => Any;
  callback: (newContext: Any, oldContext: Any) => MaybePromise<void>;
}

export type ContextAccessor<Access extends "read" | "write" = "read"> = {
  get(): op.OperationResult<Context>;
  onChange(
    selector: (context: Context) => unknown,
    callback: (newContext: Context, oldContext: Context) => void,
  ): op.OperationResult<() => void>;
} & (Access extends "write"
  ? {
      set(valueOrUpdater: Context | ((context: Context) => Context)): op.OperationResult<void>;
    }
  : unknown);

// Events
export interface EventDefinition {
  name: string;
  dataSchema?: z.ZodObject | z.ZodDiscriminatedUnion<z.ZodObject[]>;
}

export type EventsDefinition = EventDefinition[];

export type EventSource<T extends "input" | "output" = "output"> = T extends "input"
  ? z.input<typeof eventSourceSchema>
  : z.output<typeof eventSourceSchema>;

export type Event<
  T extends "input" | "output" = "output",
  EventDef extends (typeof eventsDefinition)[number] = (typeof eventsDefinition)[number],
> = EventDef extends EventDef
  ? (T extends "input"
      ? Without<z.input<typeof eventSchema>, "name" | "data" | "id" | "created" | "contextChanges">
      : Without<z.output<typeof eventSchema>, "name" | "data">) & {
      name: EventDef["name"];
    } & (EventDef extends { dataSchema: z.ZodObject | z.ZodDiscriminatedUnion<z.ZodObject[]> }
        ? {
            data: T extends "input"
              ? z.input<EventDef["dataSchema"]>
              : z.output<EventDef["dataSchema"]>;
          }
        : T extends "input"
          ? unknown
          : { data: never })
  : never;

export interface EventsAccessor {
  emit: (event: Event<"input">) => op.OperationResult<string>;
  wait: <HandlerName extends Handler["name"] | "all" = "all">(
    eventId: string,
    handlerName?: HandlerName,
  ) => Promise<
    op.OperationResult<
      HandlerName extends "all"
        ? undefined
        : Awaited<ReturnType<Extract<Handler, { name: HandlerName }>["onEvent"]>>
    >
  >;
  on: <const Selector extends EventsSelector>(
    selector: Selector,
    callback: (event: PluginEventsSelection<Selector>) => MaybePromise<void>,
  ) => op.OperationResult<() => void>;
  once: <const Selector extends EventsSelector>(
    selector: Selector,
    callback: (event: PluginEventsSelection<Selector>) => MaybePromise<void>,
  ) => op.OperationResult<() => void>;
}

export interface EventsHistory {
  eventId: string;
  results: { handlerName: HandlerDefinition["name"]; result: unknown }[];
}

export interface EventsHistoryListener {
  eventId: string;
  callback: (eventId: string) => MaybePromise<void>;
}

// - Helper type to extract event names from event definitions
export type EventsSelector<
  EventDef extends (typeof eventsDefinition)[number] = (typeof eventsDefinition)[number],
> =
  | "*"
  | EventDef["name"]
  | EventDef["name"][]
  | { include: EventDef["name"][] | "*"; exclude?: EventDef["name"][] };

export type PluginEventsSelection<
  Selector extends EventsSelector,
  EventDef extends (typeof eventsDefinition)[number] = (typeof eventsDefinition)[number],
> = Selector extends "*"
  ? Event
  : Selector extends string
    ? Extract<Event, { name: Selector }>
    : Selector extends (infer S)[]
      ? S extends EventDef["name"]
        ? Extract<Event, { name: S }>
        : never
      : Selector extends { include: infer I; exclude?: infer E }
        ? I extends "*"
          ? E extends string[]
            ? Extract<Event, { name: Exclude<EventDef["name"], E[number]> }>
            : Event
          : I extends string[]
            ? E extends string[]
              ? Extract<Event, { name: Exclude<I[number], E[number]> }>
              : Extract<Event, { name: I[number] }>
            : never
        : never;

export interface EventsListener {
  id: string;
  selector: EventsSelector;
  callback: (event: Any) => MaybePromise<void>;
}

// Handlers
export type HandlerStateDefinition =
  | Record<string, unknown>
  | ((params: { config: z.output<typeof configSchema> }) => Record<string, unknown>);

export type HandlerState<StateDef extends HandlerStateDefinition> = StateDef extends (
  p: infer _,
) => Record<string, unknown>
  ? ReturnType<StateDef>
  : StateDef;

export type HandlerFunction<
  StateDef extends HandlerStateDefinition,
  Type extends "block" | "stream",
  Output,
> = (params: {
  event: Event<"output">;
  state: HandlerState<StateDef>;
  events: EventsAccessor;
  context: ContextAccessor<Type extends "block" ? "write" : "read">;
  agent: AgentServer;
  telemetry: TelemetrySpanHandle;
}) => MaybePromise<op.OperationResult<Output>>;

export type HandlerDefinition<
  Name extends string = string,
  StateDef extends HandlerStateDefinition = HandlerStateDefinition,
  Output = unknown,
> = {
  name: Name;
  state?: StateDef;
} & (
  | { mode: "block"; onEvent: HandlerFunction<StateDef, "block", Output> }
  | { mode: "stream"; onEvent: HandlerFunction<StateDef, "stream", Output> }
);

export type Handler = (typeof handlersDefinition)[number];

// Scope
export interface ScopeDefinition<Schema extends z.ZodObject = z.ZodObject> {
  schema: Schema;
  hasAccess: (params: {
    input: z.infer<Schema>;
  }) => { allowed: true } | { allowed: false; reason?: string };
}

// Memories
export interface MemoryOptions {
  behavior?: "blocking" | "non-blocking";
  position?: { section: "top" | "bottom"; align: "start" | "end" };
  disabled?: boolean;
}

export type MemoryOutput<Deps extends Dependencies = Dependencies> =
  | Message[]
  | CreateMessageInput[]
  | ((
      params: { messages: Message[] } & DependenciesAccessors<Deps>,
    ) => MaybePromise<Message[] | CreateMessageInput[] | undefined | null>);

export interface MemoryDefinition {
  name: string;
  dependencies: Dependencies;
  output: MemoryOutput;
  options: MemoryOptions;
}

type MemoryDefinitions = MemoryDefinition[];

export interface MemoriesOptions {
  noDefaults?: boolean | string[];
}

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

// Effects
export interface EffectOptions {
  disabled?: boolean;
}

export type EffectOnMount<Deps extends Dependencies = Dependencies> = (
  params: DependenciesAccessors<Deps>,
) => MaybePromise<void | (() => MaybePromise<void>)>;

export type EffectDefinitions = EffectDefinition[];

export interface EffectsOptions {
  noDefaults?: boolean | string[];
}

export interface EffectDefinition {
  name: string;
  dependencies: Dependencies;
  onMount: EffectOnMount;
  options: EffectOptions;
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

// Agent Client
export interface AgentClient {
  config: z.output<typeof clientConfigSchema>;
  runtime: {
    events: EventsAccessor;
    context: ContextAccessor<"read">;
  };
  start(): Promise<void>;
  stop(): Promise<void>;
  continue(): void;
  /**
   * @param hint - Optional hint to help the agent decide.
   *
   * @example
   * ```ts
   * agent.decide("The user just completed the form, check if you have some follow-up questions for them.");
   * ```
   */
  decide(hint?: string): Promise<void>;
  interrupt(): Promise<void>;
  say(): Promise<void>;
  status(): Promise<Status>;
  messages: {
    getById(id: string): Promise<Message | undefined>;
    getAll(): Promise<Message[]>;
    add(message: Message): Promise<string>;
    update(id: string, message: Message): Promise<string>;
    remove(id: string): Promise<string>;
  };
  actions: {
    actionName: {
      execute(): Promise<void>;
      lastRun: null;
      setOptions(): Promise<void>;
    };
  };
  memories: {
    memoryName: {
      get(): Promise<void>;
      setOptions(): Promise<void>;
    };
  };
  stores: {
    storeName: {
      get(): Promise<void>;
      set(): Promise<void>;
      setOptions(): Promise<void>;
    };
  };
}
