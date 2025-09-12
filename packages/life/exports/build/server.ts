// This is placeholder code for typesafety.
// It is going to be replaced during compilation.

import type { z } from "zod";
import type { agentServerConfig } from "@/agent/config";
import type { AgentDefinition } from "@/agent/server/types";

type Mode = "LIFE_BUILD_MODE";
const mode = String("LIFE_BUILD_MODE");
const path = "LIFE_SERVER_BUILD_PATH";
// @ts-expect-error - This will be replaced at build time
type ActualServerBuild = typeof import("LIFE_SERVER_BUILD_PATH");
const defaultBuild = { "Run `life dev` to see your agents here.": { definition: {} as AgentDefinition, globalConfigs: {} as z.input<typeof agentServerConfig.schema>[], sha: "" } } as const;
export type ServerBuild = Mode extends "production" 
  ? Awaited<ActualServerBuild>["default"] extends never 
  ? Awaited<ActualServerBuild>
  : Awaited<ActualServerBuild>["default"] : typeof defaultBuild

/* @__PURE__ */
export async function importServerBuild(noCache: boolean = false): Promise<ServerBuild> {  
  if (mode !== "production") return defaultBuild as ServerBuild;  
  try {
    const v = noCache ? (Math.random() * 100000000).toFixed(0) : "";
    const module = await import(path + `?v=${v}`);
    return (module.default || module) as ServerBuild;
  } catch {
    return defaultBuild as ServerBuild;
  }
}

