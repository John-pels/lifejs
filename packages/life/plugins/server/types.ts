import type z from "zod";
import type { AgentServer } from "@/agent/server/class";
import type { AsyncQueue } from "@/shared/async-queue";
import type { SerializableValue } from "@/shared/canon";
import type { TelemetryClient } from "@/telemetry/types";

// - Dependencies
export type PluginDependencyDefinition = Pick<
  PluginDefinition,
  "name" | "events" | "config" | "context" | "methods"
>;
export type PluginDependenciesDefinition = Record<string, PluginDependencyDefinition>;
export type PluginDependencies<Definition extends PluginDependenciesDefinition> = {
  [K in keyof Definition]: {
    name: Definition[K]["name"];
    definition: Definition[K];
    config: PluginConfig<Definition[K]["config"], "output">;
    context: PluginContextHandler<PluginContext<Definition[K]["context"], "output">, "read">;
    events: PluginEventsHandler<Definition[K]["events"]>;
    methods: PluginMethods<Definition[K]["methods"]>;
  };
};

// - Config
export type PluginConfigDefinition = z.AnyZodObject;

export type PluginConfig<
  Schema extends PluginConfigDefinition,
  T extends "input" | "output",
> = T extends "input" ? z.input<Schema> : z.output<Schema>;

// - Context
export type PluginContextDefinition = z.AnyZodObject;

export type PluginContext<
  Schema extends PluginContextDefinition,
  T extends "input" | "output",
> = T extends "input" ? z.input<Schema> : z.output<Schema>;

export type PluginContextHandler<
  Context extends PluginContext<PluginContextDefinition, "output">,
  Mode extends "read" | "write",
> = {
  /** Subscribe to changes in the context. Returns a function to unsubscribe. */
  onChange<R extends SerializableValue>(
    selector: (context: Context) => R,
    callback: (newValue: R, oldValue: R) => void,
  ): () => void;
  /** Returns a cloned snapshot of the context. */
  get(): Context;
} & (Mode extends "write"
  ? {
      /** Set a value in the context. */
      set<K extends keyof Context>(
        key: K,
        valueOrUpdater: Context[K] | ((prev: Context[K]) => Context[K]),
      ): void;
    }
  : // biome-ignore lint/complexity/noBannedTypes: empty object type needed for conditional
    {});

// - Events
export type PluginEventsDefinition = Record<string, { dataSchema?: z.Schema }>;

export type PluginEvent<EventsDef extends PluginEventsDefinition, T extends "input" | "output"> = {
  [K in keyof EventsDef]: {
    type: K extends string ? K : never;
    urgent?: boolean;
  } & (EventsDef[K]["dataSchema"] extends z.Schema
    ? {
        data: T extends "input"
          ? z.input<EventsDef[K]["dataSchema"]>
          : z.output<EventsDef[K]["dataSchema"]>;
      }
    : // biome-ignore lint/complexity/noBannedTypes: empty object type needed for conditional
      {}) &
    (T extends "output"
      ? { id: string }
      : // biome-ignore lint/complexity/noBannedTypes: empty object type needed for conditional
        {});
}[keyof EventsDef];

export type PluginEventsSelector<EventsType extends string | number | symbol> =
  | "*"
  | EventsType
  | EventsType[]
  | { include: EventsType[] | "*"; exclude?: EventsType[] };

export type PluginEventsSelection<
  EventsDef extends PluginEventsDefinition,
  Selector extends PluginEventsSelector<keyof EventsDef>,
> = Selector extends "*"
  ? PluginEvent<EventsDef, "output">
  : Selector extends keyof EventsDef
    ? Extract<PluginEvent<EventsDef, "output">, { type: Selector }>
    : Selector extends (infer S)[]
      ? S extends keyof EventsDef
        ? PluginEvent<Pick<EventsDef, S>, "output">
        : never
      : Selector extends { include: infer I; exclude?: infer E }
        ? I extends "*"
          ? E extends (keyof EventsDef)[]
            ? Extract<
                PluginEvent<EventsDef, "output">,
                { type: Exclude<keyof EventsDef, E[number]> }
              >
            : PluginEvent<EventsDef, "output">
          : I extends (keyof EventsDef)[]
            ? E extends (keyof EventsDef)[]
              ? Extract<PluginEvent<EventsDef, "output">, { type: Exclude<I[number], E[number]> }>
              : Extract<PluginEvent<EventsDef, "output">, { type: I[number] }>
            : never
        : never;

export interface PluginEventsHandler<EventsDef extends PluginEventsDefinition> {
  on: <const Selector extends PluginEventsSelector<keyof EventsDef>>(
    selector: Selector,
    callback: (event: PluginEventsSelection<EventsDef, Selector>) => void | Promise<void>,
  ) => () => void;
  once: <const Selector extends PluginEventsSelector<keyof EventsDef>>(
    selector: Selector,
    callback: (event: PluginEventsSelection<EventsDef, Selector>) => void | Promise<void>,
  ) => () => void;
  emit: (event: PluginEvent<EventsDef, "input">) => string;
}

// - Methods
// Type for method schemas definition (the new format with schema + run)
export type PluginMethodsDefinition = Record<
  string,
  // biome-ignore lint/suspicious/noExplicitAny: Required for flexible function signatures
  { schema: z.ZodFunction<any, any>; run: (...args: any[]) => any }
>;

// Type to extract methods from method definitions
export type PluginMethods<MethodsDefinition extends PluginMethodsDefinition> = {
  [K in keyof MethodsDefinition]: (
    ...args: z.infer<MethodsDefinition[K]["schema"]["_def"]["args"]>
  ) => z.infer<MethodsDefinition[K]["schema"]["_def"]["returns"]>;
};

// - Lifecycle
export type PluginLifecycle<Definition extends PluginDefinition = PluginDefinition> = {
  onStart?: (params: {
    config: PluginConfig<Definition["config"], "output">;
    context: PluginContextHandler<PluginContext<Definition["context"], "output">, "write">;
    events: PluginEventsHandler<Definition["events"]>;
    methods: PluginMethods<Definition["methods"]>;
    telemetry: TelemetryClient;
  }) => void | Promise<void>;
  onStop?: (params: {
    config: PluginConfig<Definition["config"], "output">;
    context: PluginContextHandler<PluginContext<Definition["context"], "output">, "write">;
    events: PluginEventsHandler<Definition["events"]>;
    methods: PluginMethods<Definition["methods"]>;
    telemetry: TelemetryClient;
  }) => void | Promise<void>;
  onError?: (params: {
    config: PluginConfig<Definition["config"], "output">;
    context: PluginContextHandler<PluginContext<Definition["context"], "output">, "write">;
    events: PluginEventsHandler<Definition["events"]>;
    methods: PluginMethods<Definition["methods"]>;
    error: unknown;
    telemetry: TelemetryClient;
  }) => void | Promise<void>;
};

// - Effects
export type PluginEffectFunction<Definition extends PluginDefinition = PluginDefinition> =
  (params: {
    event: PluginEvent<Definition["events"], "output">;
    agent: AgentServer;
    config: PluginConfig<Definition["config"], "output">;
    context: PluginContextHandler<PluginContext<Definition["context"], "output">, "write">;
    dependencies: PluginDependencies<Definition["dependencies"]>;
    events: PluginEventsHandler<Definition["events"]>;
    methods: PluginMethods<Definition["methods"]>;
    telemetry: TelemetryClient;
  }) => void | Promise<void>;
export type PluginEffectsDefinition<Definition extends PluginDefinition = PluginDefinition> =
  Record<string, PluginEffectFunction<Definition>>;

// - Services
export type PluginServiceFunction<Definition extends PluginDefinition = PluginDefinition> =
  (params: {
    queue: AsyncQueue<PluginEvent<Definition["events"], "output">>;
    agent: AgentServer;
    config: PluginConfig<Definition["config"], "output">;
    context: PluginContextHandler<PluginContext<Definition["context"], "output">, "read">;
    dependencies: PluginDependencies<Definition["dependencies"]>;
    events: PluginEventsHandler<Definition["events"]>;
    methods: PluginMethods<Definition["methods"]>;
    telemetry: TelemetryClient;
  }) => void | Promise<void>;
export type PluginServicesDefinition<Definition extends PluginDefinition = PluginDefinition> =
  Record<string, PluginServiceFunction<Definition>>;

// - Interceptors
export type PluginInterceptorFunction<Definition extends PluginDefinition = PluginDefinition> =
  (params: {
    event: PluginEvent<
      PluginDependencies<Definition["dependencies"]>[keyof PluginDependencies<
        Definition["dependencies"]
      >]["definition"]["events"],
      "output"
    >;
    next: (
      event: PluginEvent<
        PluginDependencies<Definition["dependencies"]>[keyof PluginDependencies<
          Definition["dependencies"]
        >]["definition"]["events"],
        "output"
      >,
    ) => void;
    drop: (reason: string) => void;
    dependency: PluginDependencies<Definition["dependencies"]>[keyof Definition["dependencies"]] & {
      name: keyof Definition["dependencies"];
    };
    current: {
      events: PluginEventsHandler<Definition["events"]>;
      context: PluginContextHandler<PluginContext<Definition["context"], "output">, "read">;
      config: PluginConfig<Definition["config"], "output">;
    };
    telemetry: TelemetryClient;
  }) => void | Promise<void>;
export type PluginInterceptorsDefinition<Definition extends PluginDefinition = PluginDefinition> =
  Record<string, PluginInterceptorFunction<Definition>>;

// - Definition
export interface PluginDefinition {
  name: string;
  dependencies: PluginDependenciesDefinition;
  config: PluginConfigDefinition;
  context: PluginContextDefinition;
  events: PluginEventsDefinition;
  methods: PluginMethodsDefinition;
  lifecycle: PluginLifecycle;
  effects: PluginEffectsDefinition;
  services: PluginServicesDefinition;
  interceptors: PluginInterceptorsDefinition;
}
