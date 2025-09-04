import z from "zod";

export const compilerOptionsSchema = z.object({
  projectDirectory: z.string(),
  outputDirectory: z.string().default(".life"),
  watch: z.boolean().default(false),
  optimize: z.boolean().default(true),
});

export type CompilerOptions<T extends "input" | "output"> = T extends "input"
  ? z.input<typeof compilerOptionsSchema>
  : z.output<typeof compilerOptionsSchema>;
