import type { WritableAtom } from "nanostores";
import type z from "zod";
import type { RPCResponse } from "@/transport/rpc";
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
  "name" | "class" | "config" | "atoms" | "$serverDef" | "dependencies"
>;
export type PluginClientDependenciesDefinition = Record<string, PluginClientDependencyDefinition>;
export type PluginClientDependencies<Definition extends PluginClientDependenciesDefinition> = {
  [K in keyof Definition]: PluginClientInstance<Definition[K]>;
};

// - Config
export type PluginClientConfigDefinition = z.AnyZodObject;

export type PluginClientConfig<
  Schema extends PluginClientConfigDefinition,
  T extends "input" | "output",
> = T extends "input" ? z.input<Schema> : z.output<Schema>;

// - Class
export type PluginClientClassDefinition = <
  _ServerConfig extends z.output<PluginDefinition["config"]>,
  _ClientConfig extends z.output<PluginClientDefinition["config"]>,
  // biome-ignore lint/suspicious/noExplicitAny: fine for now
>() => any;

export type PluginClientClassDefinitionInput<
  ServerDefinition extends PluginDefinition = PluginDefinition,
  ClientDefinition extends PluginClientDefinition = PluginClientDefinition,
  ServerConfig extends z.output<ServerDefinition["config"]> = z.output<ServerDefinition["config"]>,
  ClientConfig extends z.output<ClientDefinition["config"]> = z.output<ClientDefinition["config"]>,
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
  server: PluginClientServer<ClientDefinition["$serverDef"]>;
}) => Record<string, WritableAtom | unknown>;

export type PluginClientAtoms<Definition extends PluginClientAtomsDefinition> =
  ReturnType<Definition>;

// - Events
export type PluginClientEventsHandler<EventsDef extends PluginEventsDefinition> = Omit<
  PluginEventsHandler<EventsDef>,
  "emit"
> & {
  emit: (event: PluginEvent<EventsDef, "input">) => Promise<RPCResponse<string>>;
};

// - Context
export type PluginClientContextHandler<
  Context extends PluginContext<PluginContextDefinition, "output">,
> = PluginContextHandler<Context, "read">;

// - Methods
export type PluginClientMethods<MethodsDefinition extends PluginMethodsDefinition> = {
  [K in keyof MethodsDefinition]: (
    ...args: z.infer<MethodsDefinition[K]["schema"]["_def"]["args"]>
  ) => Promise<RPCResponse<z.infer<MethodsDefinition[K]["schema"]["_def"]["returns"]>>>;
};

// - Server
export type PluginClientServer<ServerDefinition extends PluginDefinition> = {
  methods: PluginClientMethods<ServerDefinition["methods"]>;
  context: PluginClientContextHandler<PluginContext<ServerDefinition["context"], "output">>;
  events: PluginClientEventsHandler<ServerDefinition["events"]>;
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
