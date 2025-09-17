import type z from "zod";
import type { AgentServer } from "@/agent/server/class";
import type { AsyncQueue } from "@/shared/async-queue";
import type { Config } from "@/shared/config";
import type * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import type { TelemetrySpanHandle } from "@/telemetry/types";

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
    context: op.ToPublic<
      PluginContextHandler<PluginContext<Definition[K]["context"], "output">, "read">
    >;
    events: op.ToPublic<PluginEventsHandler<Definition[K]["events"]>>;
    methods: op.ToPublic<PluginMethods<Definition[K]["methods"]>>;
  };
};

// - Config
export type PluginConfigDefinition = Config<z.ZodObject>;

export type PluginConfig<
  ConfigDef extends PluginConfigDefinition,
  T extends "input" | "output",
> = T extends "input" ? z.input<ConfigDef["schema"]> : z.output<ConfigDef["schema"]>;

// - Context
export type PluginContextDefinition = z.ZodObject;

export type PluginContext<
  Schema extends PluginContextDefinition,
  T extends "input" | "output",
> = T extends "input" ? z.input<Schema> : z.output<Schema>;

export type PluginContextHandler<
  Context extends PluginContext<PluginContextDefinition, "output">,
  Mode extends "read" | "write",
> = {
  /** Subscribe to changes in the context. Returns a function to unsubscribe. */
  onChange(
    selector: (context: Context) => unknown,
    callback: (newContext: Context, oldContext: Context) => void,
  ): op.OperationResult<() => void>;
  /** Returns a cloned snapshot of the context. */
  get(): op.OperationResult<Context>;
} & (Mode extends "write"
  ? {
      /** Set a value in the context. */
      set(valueOrUpdater: Context | ((ctx: Context) => Context)): op.OperationResult<void>;
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
  ) => op.OperationResult<() => void>;
  once: <const Selector extends PluginEventsSelector<keyof EventsDef>>(
    selector: Selector,
    callback: (event: PluginEventsSelection<EventsDef, Selector>) => void | Promise<void>,
  ) => op.OperationResult<() => void>;
  emit: (event: PluginEvent<EventsDef, "input">) => op.OperationResult<string>;
}

// - Methods
export type PluginMethodSchemas = { input: z.ZodObject; output: z.ZodObject };
export type PluginMethodDefinition<
  Definition extends PluginDefinition,
  Schemas extends PluginMethodSchemas,
> = {
  schema: Schemas;
  run: (
    params: {
      config: PluginConfig<Definition["config"], "output">;
      context: op.ToPublic<
        PluginContextHandler<PluginContext<Definition["context"], "output">, "read">
      >;
      events: op.ToPublic<PluginEventsHandler<Definition["events"]>>;
      telemetry: TelemetrySpanHandle;
    },
    input: Schemas["input"] extends z.ZodObject ? z.infer<Schemas["input"]> : never,
  ) => MaybePromise<z.infer<Schemas["output"]> | op.OperationResult<z.infer<Schemas["output"]>>>;
};
// Type for method schemas definition (consistent with tools definition)
export type PluginMethodsDefinition = Record<
  string,
  {
    schema: PluginMethodSchemas;
    // biome-ignore lint/suspicious/noExplicitAny: Required for flexible function signatures
    run: (...args: any[]) => any;
  }
>;

// Type to extract methods from method definitions
export type PluginMethods<MethodsDefinition extends PluginMethodsDefinition> = {
  [K in keyof MethodsDefinition]: (
    input: z.infer<MethodsDefinition[K]["schema"]["input"]>,
  ) => Promise<op.OperationResult<z.infer<MethodsDefinition[K]["schema"]["output"]>>>;
};

// - Lifecycle
export type PluginLifecycle<Definition extends PluginDefinition = PluginDefinition> = {
  onStart?: (params: {
    config: PluginConfig<Definition["config"], "output">;
    context: op.ToPublic<
      PluginContextHandler<PluginContext<Definition["context"], "output">, "write">
    >;
    events: op.ToPublic<PluginEventsHandler<Definition["events"]>>;
    methods: op.ToPublic<PluginMethods<Definition["methods"]>>;
    telemetry: TelemetrySpanHandle;
  }) => void | Promise<void>;
  onStop?: (params: {
    config: PluginConfig<Definition["config"], "output">;
    context: op.ToPublic<
      PluginContextHandler<PluginContext<Definition["context"], "output">, "write">
    >;
    events: op.ToPublic<PluginEventsHandler<Definition["events"]>>;
    methods: op.ToPublic<PluginMethods<Definition["methods"]>>;
    telemetry: TelemetrySpanHandle;
  }) => void | Promise<void>;
  onRestart?: (params: {
    config: PluginConfig<Definition["config"], "output">;
    context: op.ToPublic<
      PluginContextHandler<PluginContext<Definition["context"], "output">, "write">
    >;
    events: op.ToPublic<PluginEventsHandler<Definition["events"]>>;
    methods: op.ToPublic<PluginMethods<Definition["methods"]>>;
    telemetry: TelemetrySpanHandle;
  }) => void | Promise<void>;
  onError?: (params: {
    config: PluginConfig<Definition["config"], "output">;
    context: op.ToPublic<
      PluginContextHandler<PluginContext<Definition["context"], "output">, "write">
    >;
    events: op.ToPublic<PluginEventsHandler<Definition["events"]>>;
    methods: op.ToPublic<PluginMethods<Definition["methods"]>>;
    error: unknown;
    telemetry: TelemetrySpanHandle;
  }) => void | Promise<void>;
};

// - Effects
export type PluginEffectFunction<Definition extends PluginDefinition = PluginDefinition> =
  (params: {
    event: PluginEvent<Definition["events"], "output">;
    agent: op.ToPublic<AgentServer>;
    config: PluginConfig<Definition["config"], "output">;
    context: op.ToPublic<
      PluginContextHandler<PluginContext<Definition["context"], "output">, "write">
    >;
    dependencies: PluginDependencies<Definition["dependencies"]>;
    events: op.ToPublic<PluginEventsHandler<Definition["events"]>>;
    methods: op.ToPublic<PluginMethods<Definition["methods"]>>;
    telemetry: TelemetrySpanHandle;
  }) => void | Promise<void>;
export type PluginEffectsDefinition<Definition extends PluginDefinition = PluginDefinition> =
  Record<string, PluginEffectFunction<Definition>>;

// - Services
export type PluginServiceFunction<Definition extends PluginDefinition = PluginDefinition> =
  (params: {
    queue: AsyncQueue<PluginEvent<Definition["events"], "output">>;
    agent: op.ToPublic<AgentServer>;
    config: PluginConfig<Definition["config"], "output">;
    context: op.ToPublic<
      PluginContextHandler<PluginContext<Definition["context"], "output">, "read">
    >;
    dependencies: PluginDependencies<Definition["dependencies"]>;
    events: op.ToPublic<PluginEventsHandler<Definition["events"]>>;
    methods: op.ToPublic<PluginMethods<Definition["methods"]>>;
    telemetry: TelemetrySpanHandle;
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
      events: op.ToPublic<PluginEventsHandler<Definition["events"]>>;
      context: op.ToPublic<
        PluginContextHandler<PluginContext<Definition["context"], "output">, "read">
      >;
      config: PluginConfig<Definition["config"], "output">;
    };
    telemetry: TelemetrySpanHandle;
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
