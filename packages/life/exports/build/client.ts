
import type { AgentClientDefinition, AgentClientPluginsMapping } from "@/agent/client/types";
import * as op from "@/shared/operation";

// Those uppercased placeholders will be replaced during compilation.
type Mode = "LIFE_BUILD_MODE";
const module: string | Promise<{ default: ClientBuild }> = String("LIFE_CLIENT_BUILD_MODULE");

// @ts-expect-error
type ActualClientBuild = typeof import("LIFE_CLIENT_BUILD_PATH");
const defaultBuild = { "Run `life dev` to see your agents here.": { definition: {} as AgentClientDefinition, plugins: {} as AgentClientPluginsMapping, sha: "" } } as const;
export type ClientBuild = Mode extends "production" 
  ? Awaited<ActualClientBuild>["default"] extends never 
  ? Awaited<ActualClientBuild>
  : Awaited<ActualClientBuild>["default"] : typeof defaultBuild

/* @__PURE__ */
export async function importClientBuild(): Promise<op.OperationResult<ClientBuild>> {  
  if (typeof module === "string") return op.success(defaultBuild as ClientBuild); 
  else return op.success((await module).default as ClientBuild);
}

