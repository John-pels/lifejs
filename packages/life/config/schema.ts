import z from "zod";
import { agentServerConfigSchema } from "@/agent/config/server";

export const lifeConfigSchema = z.object({
  cli: z.object({}),
  server: z.object({
    port: z.number().prefault(3003),
    host: z.string().prefault("localhost"),
    token: z.string().prefault(process.env.LIFE_SERVER_TOKEN ?? ""),
  }),
  agents: agentServerConfigSchema,
});
