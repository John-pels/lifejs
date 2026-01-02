import type z from "zod";
import type { agentServerConfigSchema } from "./server";

/**
 * Used to define a portable agent config.
 * @param def - The config definition.
 * @returns The validated config.
 */
export function defineConfig(config: z.input<typeof agentServerConfigSchema>) {
  return config;
}
