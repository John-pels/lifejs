import type z from "zod";
import type { lifeConfigSchema } from "./schema";

export type LifeConfig<T extends "input" | "output" = "output"> = T extends "input"
  ? z.input<typeof lifeConfigSchema>
  : z.output<typeof lifeConfigSchema>;
