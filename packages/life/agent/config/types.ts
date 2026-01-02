import type z from "zod";
import type { agentClientConfigSchema } from "./client";
import type { agentServerConfigSchema } from "./server";

export type AgentConfig<
  T extends "server" | "client" = "server",
  K extends "input" | "output" = "output",
> = T extends "server"
  ? T extends "input"
    ? z.input<typeof agentServerConfigSchema>
    : z.output<typeof agentServerConfigSchema>
  : T extends "client"
    ? K extends "input"
      ? z.input<typeof agentClientConfigSchema>
      : z.output<typeof agentClientConfigSchema>
    : never;
