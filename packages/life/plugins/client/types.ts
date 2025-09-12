import type { WritableAtom } from "nanostores";
import type z from "zod";
import type { Config } from "@/shared/config";
import type * as op from "@/shared/operation";
import type {
  PluginContext,
  PluginContextDefinition,
  PluginContextHandler,
  PluginDefinition,
  PluginEvent,
  PluginEventsDefinition,
  PluginEventsHandler,
  PluginMethodsDefinition,
} from "../server/types";
import type { PluginClientBase } from "./class";

// - Dependencies
export type PluginClientDependencyDefinition = Pick<
  PluginClientDefinition,
  "name" | "class" | "config" | "atoms" | "$serverDef"
>;
export type PluginClientDependenciesDefinition = Record<string, PluginClientDependencyDefinition>;
export type PluginClientDependencies<Definition extends PluginClientDependenciesDefinition> = {
  // @ts-expect-error
  [K in keyof Definition]: op.ToPublic<PluginClientInstance<Definition[K]>>;
};

// - Config
export type PluginClientConfigDefinition = Config<z.AnyZodObject>;

export type PluginClientConfig<
  Schema extends PluginClientConfigDefinition,
  T extends "input" | "output",
> = T extends "input" ? z.input<Schema["schema"]> : z.output<Schema["schema"]>;

// - Class
export type PluginClientClassDefinition = <
  _ServerConfig extends z.output<PluginDefinition["config"]["schema"]>,
  _ClientConfig extends z.output<PluginClientDefinition["config"]["schema"]>,
  // biome-ignore lint/suspicious/noExplicitAny: on purpose
>() => any;

export type PluginClientClassDefinitionInput<
  ServerDefinition extends PluginDefinition = PluginDefinition,
  ClientDefinition extends PluginClientDefinition = PluginClientDefinition,
  ServerConfig extends z.output<ServerDefinition["config"]["schema"]> = z.output<
    ServerDefinition["config"]["schema"]
  >,
  ClientConfig extends z.output<ClientDefinition["config"]["schema"]> = z.output<
    ClientDefinition["config"]["schema"]
  >,
> = (
  $Types: {
    ServerDefinition: ServerDefinition;
    ClientDefinition: ClientDefinition;
    ServerConfig: ServerConfig;
    ClientConfig: ClientConfig;
  },
  Base: typeof PluginClientBase<ClientDefinition>,
) => PluginClientClassDefinition;

export type PluginClientInstance<Definition extends PluginClientDefinition> =
  PluginClientBase<Definition> & InstanceType<ReturnType<Definition["class"]>>;

// - Atoms
export type PluginClientAtomsDefinition<
  ClientDefinition extends PluginClientDefinition = PluginClientDefinition,
> = (params: {
  config: PluginClientConfig<ClientDefinition["config"], "output">;
  dependencies: PluginClientDependencies<ClientDefinition["dependencies"]>;
  server: PluginClientServer<ClientDefinition["$serverDef"], "public">;
}) => Record<string, WritableAtom | unknown>;

export type PluginClientAtoms<Definition extends PluginClientAtomsDefinition> =
  ReturnType<Definition>;

// - Events
export type PluginClientEventsHandler<EventsDef extends PluginEventsDefinition> = Omit<
  PluginEventsHandler<EventsDef>,
  "emit"
> & {
  emit: (event: PluginEvent<EventsDef, "input">) => Promise<op.OperationResult<string>>;
};

// - Context
export type PluginClientContextHandler<
  Context extends PluginContext<PluginContextDefinition, "output">,
> = PluginContextHandler<Context, "read">;

// - Methods
export type PluginClientMethods<MethodsDefinition extends PluginMethodsDefinition> = {
  [K in keyof MethodsDefinition]: (
    input: z.infer<MethodsDefinition[K]["schema"]["input"]>,
  ) => Promise<op.OperationResult<z.infer<MethodsDefinition[K]["schema"]["output"]>>>;
};

// - Server
export type PluginClientServer<
  ServerDefinition extends PluginDefinition,
  Visibility extends "internal" | "public",
> = {
  methods: Visibility extends "internal"
    ? PluginClientMethods<ServerDefinition["methods"]>
    : op.ToPublic<PluginClientMethods<ServerDefinition["methods"]>>;
  context: Visibility extends "internal"
    ? PluginClientContextHandler<PluginContext<ServerDefinition["context"], "output">>
    : op.ToPublic<PluginClientContextHandler<PluginContext<ServerDefinition["context"], "output">>>;
  events: Visibility extends "internal"
    ? PluginClientEventsHandler<ServerDefinition["events"]>
    : op.ToPublic<PluginClientEventsHandler<ServerDefinition["events"]>>;
};

// - Definition
export interface PluginClientDefinition {
  name: string;
  dependencies: PluginClientDependenciesDefinition;
  config: PluginClientConfigDefinition;
  class: PluginClientClassDefinition;
  atoms: PluginClientAtomsDefinition;
  $serverDef: PluginDefinition;
}
