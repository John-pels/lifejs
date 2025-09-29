import path from "path";
import type { z } from "zod";
import type { agentServerConfig } from "@/agent/server/config";
import type { AgentDefinition } from "@/agent/server/types";

// Those uppercased placeholders will be replaced during compilation.
type Mode = "LIFE_BUILD_MODE";// @ts-expect-error
type ActualServerBuild = typeof import("LIFE_SERVER_BUILD_PATH");

const defaultBuild = { "Run `life dev` to see your agents here.": { definition: {} as AgentDefinition, globalConfigs: {} as z.input<typeof agentServerConfig.schema>[], sha: "" } } as const;
export type ServerBuild = Mode extends "production" 
  ? Awaited<ActualServerBuild>["default"] extends never 
  ? Awaited<ActualServerBuild>
  : Awaited<ActualServerBuild>["default"] : typeof defaultBuild

/* @__PURE__ */
export async function importServerBuild(options: { projectDirectory: string , noCache: boolean} ): Promise<ServerBuild> {  
  try {
    const p = path.join(options.projectDirectory, ".life", "server", "dist", "index.js");
    const v = options.noCache ? (Math.random() * 100000000).toFixed(0) : "cached";
    const module = await import(p + `?v=${v}`);
    return (module.default || module) as ServerBuild;
  } catch {
    return defaultBuild as ServerBuild;
  }
}

