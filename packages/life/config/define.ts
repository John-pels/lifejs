import type z from "zod";
import type { lifeConfigSchema } from "./schema";

export const defineLifeConfig = <T extends z.input<typeof lifeConfigSchema>>(config: T) => config;
