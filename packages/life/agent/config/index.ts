import type { z } from "zod";
import { deepClone } from "@/shared/deep-clone";
import { deepMerge } from "@/shared/deep-merge";
import * as op from "@/shared/operation";
import { clientConfigSchema } from "./schema/client";
import { configSchema } from "./schema/server";

/**
 * Used to define a global config in a `life.config.ts` file.
 * @param def - The config definition.
 * @returns The validated config.
 */
export function defineConfig(config: z.input<typeof configSchema>) {
  return config;
}

/**
 * Prepare the agent config by merging the local agent config with
 * the global configs, and producing the client-side subset config.
 */
export function prepareAgentConfig(
  localConfig: z.input<typeof configSchema>,
  globalConfig: z.input<typeof configSchema>,
) {
  // Obtain and validate the final config object
  const mergedConfig = deepMerge(deepClone(globalConfig), localConfig);
  const { error: errorConfig, data: serverConfig } = configSchema.safeParse(mergedConfig);
  if (errorConfig)
    return op.failure({
      code: "Validation",
      message: "Invalid agent server config.",
      cause: errorConfig,
    });

  // Produce the client-side subset config
  const { error: errorClientConfig, data: clientConfig } =
    clientConfigSchema.safeParse(serverConfig);
  if (errorClientConfig)
    return op.failure({
      code: "Validation",
      message: "Invalid agent client config.",
      cause: errorClientConfig,
    });

  return op.success({ server: serverConfig, client: clientConfig });
}
