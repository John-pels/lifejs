import { z } from "zod";
import type { TelemetryClient } from "@/telemetry/types";
import type {
  PluginConfig,
  PluginConfigDefinition,
  PluginContext,
  PluginContextHandler,
  PluginDefinition,
  PluginDependenciesDefinition,
  PluginEffectFunction,
  PluginEventsDefinition,
  PluginEventsHandler,
  PluginInterceptorFunction,
  PluginLifecycle,
  PluginMethodsDefinition,
  PluginServiceFunction,
} from "./types";

export class PluginBuilder<
  const Definition extends PluginDefinition,
  EffectKeys extends string = never,
  ServiceKeys extends string = never,
  InterceptorKeys extends string = never,
  ExcludedMethods extends string = never,
> {
  _definition: Definition;

  constructor(def: Definition) {
    this._definition = def;
  }

  dependencies<const Plugins extends { _definition: PluginDefinition }[]>(plugins: Plugins) {
    // Convert array of plugin builders to dependencies definition
    const dependencies: PluginDependenciesDefinition = {};
    for (const plugin of plugins) dependencies[plugin._definition.name] = plugin._definition;

    // Type to extract dependency definition from array of plugins
    type ExtractedDependencies = {
      [K in Plugins[number] as K["_definition"]["name"]]: {
        name: K["_definition"]["name"];
        events: K["_definition"]["events"];
        config: K["_definition"]["config"];
        context: K["_definition"]["context"];
        methods: K["_definition"]["methods"];
      };
    };

    const plugin = new PluginBuilder({
      ...this._definition,
      dependencies,
    }) as unknown as PluginBuilder<
      Definition & { dependencies: ExtractedDependencies },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "dependencies"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "dependencies">;
  }

  config<const Schema extends PluginConfigDefinition>(schema: Schema) {
    const plugin = new PluginBuilder({
      ...this._definition,
      config: schema,
    }) as PluginBuilder<
      Definition & { config: Schema },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "config"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "config">;
  }

  context<Schema extends z.AnyZodObject>(schema: Schema) {
    const plugin = new PluginBuilder({
      ...this._definition,
      context: schema,
    }) as PluginBuilder<
      Definition & { context: Schema },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "context"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "context">;
  }

  events<const EventsDef extends PluginEventsDefinition>(events: EventsDef) {
    const plugin = new PluginBuilder({
      ...this._definition,
      events,
    }) as PluginBuilder<
      Definition & { events: EventsDef },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "events"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "events">;
  }

  methodsold<const MethodsDef extends PluginMethodsDefinition>(methods: MethodsDef) {
    const plugin = new PluginBuilder({
      ...this._definition,
      methods,
    }) as PluginBuilder<
      Definition & { methods: MethodsDef },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "methods"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "methods">;
  }

  methods<const Schemas extends Record<string, { input: z.AnyZodObject; output: z.AnyZodObject }>>(
    methods: {
      [K in keyof Schemas]: {
        schema: Schemas[K];
        run: Schemas[K] extends { input: z.AnyZodObject; output: z.AnyZodObject }
          ? (
              params: {
                config: PluginConfig<Definition["config"], "output">;
                context: PluginContextHandler<
                  PluginContext<Definition["context"], "output">,
                  "read"
                >;
                events: PluginEventsHandler<Definition["events"]>;
                telemetry: TelemetryClient;
              },
              input: z.infer<Schemas[K]["input"]>,
            ) => z.infer<Schemas[K]["output"]> | Promise<z.infer<Schemas[K]["output"]>>
          : never;
      };
    },
  ) {
    const plugin = new PluginBuilder({
      ...this._definition,
      methods,
    }) as PluginBuilder<
      Definition & { methods: typeof methods },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "methods"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "methods">;
  }

  /*
  
    // biome-ignore lint/suspicious/noExplicitAny: required here
  methods<const Schemas extends Record<string, z.ZodFunction<any, any>>>(
    methods: {
      [K in keyof Schemas]: {
        schema: Schemas[K];
        run: Schemas[K] extends z.ZodFunction<infer TArgs, infer TReturns>
          ? (
              params: {
                config: PluginConfig<Definition["config"], "output">;
                context: PluginContextHandler<
                  PluginContext<Definition["context"], "output">,
                  "read"
                >;
                events: PluginEventsHandler<Definition["events"]>;
                telemetry: TelemetryClient;
              },
              ...args: z.infer<TArgs> extends readonly unknown[] ? z.infer<TArgs> : never
            ) => z.infer<TReturns> | Promise<z.infer<TReturns>>
          : never;
      };
    },
  ) {
    const plugin = new PluginBuilder({
      ...this._definition,
      methods,
    }) as PluginBuilder<
      Definition & { methods: typeof methods },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "methods"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "methods">;
  }
    
  */

  lifecycle<const LifecycleConfig extends PluginLifecycle<Definition>>(lifecycle: LifecycleConfig) {
    const plugin = new PluginBuilder({
      ...this._definition,
      lifecycle,
    }) as unknown as PluginBuilder<
      Definition,
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "lifecycle"
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods | "lifecycle">;
  }

  addEffect<const Name extends string>(name: Name, effect: PluginEffectFunction<Definition>) {
    const plugin = new PluginBuilder({
      ...this._definition,
      effects: { ...(this._definition.effects ?? {}), [name]: effect },
    }) as PluginBuilder<
      Definition,
      EffectKeys | Name,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeEffect<const Name extends EffectKeys>(name: Name) {
    const { [name]: _removed, ...remainingEffects } = this._definition.effects ?? {};
    const plugin = new PluginBuilder({
      ...this._definition,
      effects: remainingEffects,
    }) as unknown as PluginBuilder<
      Definition,
      Exclude<EffectKeys, Name>,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  addService<const Name extends string>(name: Name, service: PluginServiceFunction<Definition>) {
    const plugin = new PluginBuilder({
      ...this._definition,
      services: { ...(this._definition.services ?? {}), [name]: service },
    }) as PluginBuilder<
      Definition,
      EffectKeys,
      ServiceKeys | Name,
      InterceptorKeys,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeService<const Name extends ServiceKeys>(name: Name) {
    const { [name]: _removed, ...remainingServices } = this._definition.services ?? {};
    const plugin = new PluginBuilder({
      ...this._definition,
      services: remainingServices,
    }) as unknown as PluginBuilder<
      Definition,
      EffectKeys,
      Exclude<ServiceKeys, Name>,
      InterceptorKeys,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  addInterceptor<const Name extends string>(
    name: Name,
    interceptor: PluginInterceptorFunction<Definition>,
  ) {
    const plugin = new PluginBuilder({
      ...this._definition,
      interceptors: { ...(this._definition.interceptors ?? {}), [name]: interceptor },
    }) as PluginBuilder<
      Definition,
      EffectKeys,
      ServiceKeys,
      InterceptorKeys | Name,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  removeInterceptor<const Name extends InterceptorKeys>(name: Name) {
    const { [name]: _removed, ...remainingInterceptors } = this._definition.interceptors ?? {};
    const plugin = new PluginBuilder({
      ...this._definition,
      interceptors: remainingInterceptors,
    }) as unknown as PluginBuilder<
      Definition,
      EffectKeys,
      ServiceKeys,
      Exclude<InterceptorKeys, Name>,
      ExcludedMethods
    >;
    return plugin as Omit<typeof plugin, ExcludedMethods>;
  }

  pick<
    const Options extends {
      events?: Array<keyof Definition["events"]>;
      context?: Array<keyof Definition["context"]["shape"]>;
      config?: boolean | Array<keyof Definition["config"]["shape"]>;
    },
  >(_options: Options) {
    // Pick is now type-only - runtime always returns the full plugin
    // TypeScript will enforce the constraints at compile time
    const pickedDefinition: PluginDefinition = this._definition;

    // Type for the picked definition
    type PickedDefinition = {
      name: Definition["name"];
      config: Options["config"] extends true
        ? Definition["config"]
        : Options["config"] extends readonly string[]
          ? z.ZodObject<Pick<Definition["config"]["shape"], Options["config"][number]>>
          : z.ZodObject<Record<string, never>>;
      events: Options["events"] extends readonly string[]
        ? Pick<Definition["events"], Options["events"][number]>
        : never;
      context: Options["context"] extends readonly string[]
        ? z.ZodObject<Pick<Definition["context"]["shape"], Options["context"][number]>>
        : never;
      dependencies: never;
      lifecycle: never;
      effects: never;
      services: never;
      interceptors: never;
      methods: never;
    };

    return new PluginBuilder(pickedDefinition) as unknown as PluginBuilder<
      PickedDefinition,
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods
    >;
  }
}

export function definePlugin<const Name extends string>(name: Name) {
  return new PluginBuilder({
    name,
    dependencies: {},
    config: z.object({}),
    context: z.object({}),
    events: {},
    lifecycle: {},
    effects: {},
    interceptors: {},
    services: {},
    methods: {},
  });
}
