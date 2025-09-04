import z from "zod";

export const serverOptionsSchema = z.object({
  projectDirectory: z.string(),
  token: z.string(),
  watch: z.boolean().default(false),
  host: z.string().default("localhost"),
  port: z.string().default("3003"),
});

export type ServerOptions<T extends "input" | "output"> = T extends "input"
  ? z.input<typeof serverOptionsSchema>
  : z.output<typeof serverOptionsSchema>;
