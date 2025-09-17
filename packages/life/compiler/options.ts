import z from "zod";

export const compilerOptionsSchema = z.object({
  projectDirectory: z.string(),
  outputDirectory: z.string().prefault(".life"),
  watch: z.boolean().prefault(false),
  optimize: z.boolean().prefault(true),
});

export type CompilerOptions<T extends "input" | "output"> = T extends "input"
  ? z.input<typeof compilerOptionsSchema>
  : z.output<typeof compilerOptionsSchema>;
