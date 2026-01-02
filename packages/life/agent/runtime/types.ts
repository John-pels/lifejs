import type z from "zod";
import type * as op from "@/shared/operation";
import type { Any, MaybePromise, Without } from "@/shared/types";
import type { TelemetrySpanHandle } from "@/telemetry/types";
import type { AgentConfig } from "../config/types";
import type { AgentServer } from "../core/server";
import type { contextDefinition } from "./context";
import type { eventSchema, eventSourceSchema, eventsDefinition } from "./events";
import type { handlersDefinition } from "./handlers";

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
  | ((params: { config: AgentConfig }) => Record<string, unknown>);

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
