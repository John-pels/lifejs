// This is placeholder code for typesafety.
// It is going to be replaced during compilation.

import type { AgentClientDefinition, AgentClientPluginsMapping } from "@/agent/client/types";

type Mode = "LIFE_BUILD_MODE";
const mode = String("LIFE_BUILD_MODE");
const path = "LIFE_CLIENT_BUILD_PATH";
// @ts-expect-error - This will be replaced at build time
type ActualClientBuild = typeof import("LIFE_CLIENT_BUILD_PATH");
const defaultBuild = { "Run `life dev` to see your agents here.": { definition: {} as AgentClientDefinition, plugins: {} as AgentClientPluginsMapping } } as const;
export type ClientBuild = Mode extends "production" 
  ? Awaited<ActualClientBuild>["default"] extends never 
  ? Awaited<ActualClientBuild>
  : Awaited<ActualClientBuild>["default"] : typeof defaultBuild

/* @__PURE__ */
export async function importClientBuild(noCache: boolean = false): Promise<ClientBuild> {  
  if (mode !== "production") return defaultBuild as ClientBuild;  
  try {
    const v = noCache ? (Math.random() * 100000000).toFixed(0) : "";
    const module = await import(path + `?v=${v}`);
    return (module.default || module) as ClientBuild;
  } catch {
    return defaultBuild as ClientBuild;
  }
}

