import { z } from "zod";
import { type Config, createConfig, type DeeplyEditable } from "@/shared/config";
import type {
  PluginDefinition,
  PluginDependenciesDefinition,
  PluginEffectFunction,
  PluginEventsDefinition,
  PluginInterceptorFunction,
  PluginLifecycle,
  PluginMethodDefinition,
  PluginMethodSchemas,
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

    const builder = new PluginBuilder({
      ...this._definition,
      dependencies,
    }) as unknown as PluginBuilder<
      Definition & { dependencies: ExtractedDependencies },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "dependencies"
    >;
    return builder as Omit<typeof builder, ExcludedMethods | "dependencies">;
  }

  config<const Schema extends z.ZodObject>({
    schema,
    toTelemetryAttribute = () => ({}),
  }: {
    schema: Schema;
    toTelemetryAttribute?: (data: DeeplyEditable<z.output<Schema>>) => Record<string, unknown>;
  }) {
    const builder = new PluginBuilder({
      ...this._definition,
      config: createConfig({ schema, toTelemetryAttribute }),
    }) as PluginBuilder<
      Definition & { config: Config<Schema> },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "config"
    >;
    return builder as Omit<typeof builder, ExcludedMethods | "config">;
  }

  context<Schema extends z.ZodObject>(schema: Schema) {
    const builder = new PluginBuilder({
      ...this._definition,
      context: schema,
    }) as PluginBuilder<
      Definition & { context: Schema },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "context"
    >;
    return builder as Omit<typeof builder, ExcludedMethods | "context">;
  }

  events<const EventsDef extends PluginEventsDefinition>(events: EventsDef) {
    const builder = new PluginBuilder({
      ...this._definition,
      events,
    }) as PluginBuilder<
      Definition & { events: EventsDef },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "events"
    >;
    return builder as Omit<typeof builder, ExcludedMethods | "events">;
  }

  methods<const Schemas extends Record<string, PluginMethodSchemas>>(
    methods: {
      [K in keyof Schemas]: PluginMethodDefinition<Definition, Schemas[K]>;
    },
  ) {
    const builder = new PluginBuilder({
      ...this._definition,
      methods,
    }) as PluginBuilder<
      Definition & { methods: typeof methods },
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "methods"
    >;
    return builder as Omit<typeof builder, ExcludedMethods | "methods">;
  }

  lifecycle<const LifecycleConfig extends PluginLifecycle<Definition>>(lifecycle: LifecycleConfig) {
    const builder = new PluginBuilder({
      ...this._definition,
      lifecycle,
    }) as unknown as PluginBuilder<
      Definition,
      EffectKeys,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods | "lifecycle"
    >;
    return builder as Omit<typeof builder, ExcludedMethods | "lifecycle">;
  }

  addEffect<const Name extends string>(name: Name, effect: PluginEffectFunction<Definition>) {
    const builder = new PluginBuilder({
      ...this._definition,
      effects: { ...(this._definition.effects ?? {}), [name]: effect },
    }) as PluginBuilder<
      Definition,
      EffectKeys | Name,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods
    >;
    return builder as Omit<typeof builder, ExcludedMethods>;
  }

  removeEffect<const Name extends EffectKeys>(name: Name) {
    const { [name]: _removed, ...remainingEffects } = this._definition.effects ?? {};
    const builder = new PluginBuilder({
      ...this._definition,
      effects: remainingEffects,
    }) as unknown as PluginBuilder<
      Definition,
      Exclude<EffectKeys, Name>,
      ServiceKeys,
      InterceptorKeys,
      ExcludedMethods
    >;
    return builder as Omit<typeof builder, ExcludedMethods>;
  }

  addService<const Name extends string>(name: Name, service: PluginServiceFunction<Definition>) {
    const builder = new PluginBuilder({
      ...this._definition,
      services: { ...(this._definition.services ?? {}), [name]: service },
    }) as PluginBuilder<
      Definition,
      EffectKeys,
      ServiceKeys | Name,
      InterceptorKeys,
      ExcludedMethods
    >;
    return builder as Omit<typeof builder, ExcludedMethods>;
  }

  removeService<const Name extends ServiceKeys>(name: Name) {
    const { [name]: _removed, ...remainingServices } = this._definition.services ?? {};
    const builder = new PluginBuilder({
      ...this._definition,
      services: remainingServices,
    }) as unknown as PluginBuilder<
      Definition,
      EffectKeys,
      Exclude<ServiceKeys, Name>,
      InterceptorKeys,
      ExcludedMethods
    >;
    return builder as Omit<typeof builder, ExcludedMethods>;
  }

  addInterceptor<const Name extends string>(
    name: Name,
    interceptor: PluginInterceptorFunction<Definition>,
  ) {
    const builder = new PluginBuilder({
      ...this._definition,
      interceptors: { ...(this._definition.interceptors ?? {}), [name]: interceptor },
    }) as PluginBuilder<
      Definition,
      EffectKeys,
      ServiceKeys,
      InterceptorKeys | Name,
      ExcludedMethods
    >;
    return builder as Omit<typeof builder, ExcludedMethods>;
  }

  removeInterceptor<const Name extends InterceptorKeys>(name: Name) {
    const { [name]: _removed, ...remainingInterceptors } = this._definition.interceptors ?? {};
    const builder = new PluginBuilder({
      ...this._definition,
      interceptors: remainingInterceptors,
    }) as unknown as PluginBuilder<
      Definition,
      EffectKeys,
      ServiceKeys,
      Exclude<InterceptorKeys, Name>,
      ExcludedMethods
    >;
    return builder as Omit<typeof builder, ExcludedMethods>;
  }

  pick<
    const Options extends {
      events?: Array<keyof Definition["events"]>;
      context?: Array<keyof Definition["context"]["shape"]>;
      config?: boolean | Array<keyof Definition["config"]["schema"]["shape"]>;
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
          ? Config<
              z.ZodObject<Pick<Definition["config"]["schema"]["shape"], Options["config"][number]>>
            >
          : Config<z.ZodObject<Record<string, never>>>;
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
    config: createConfig({ schema: z.object() }),
    context: z.object(),
    events: {},
    lifecycle: {},
    effects: {},
    interceptors: {},
    services: {},
    methods: {},
  });
}
