import type { z } from "zod";
import { deepClone } from "@/shared/deep-clone";
import { deepMerge } from "@/shared/deep-merge";
import * as op from "@/shared/operation";
import { agentClientConfigSchema } from "./client";
import { agentServerConfigSchema } from "./server";

/**
 * Prepare the agent config by merging the local agent config with
 * the global configs, and producing the client-side subset config.
 */
export function prepareAgentConfig(
  localConfig: z.input<typeof agentServerConfigSchema>,
  globalConfig: z.input<typeof agentServerConfigSchema>,
) {
  // Obtain and validate the final config object
  const mergedConfig = deepMerge(deepClone(globalConfig), localConfig);
  const { error: errorConfig, data: serverConfig } =
    agentServerConfigSchema.safeParse(mergedConfig);
  if (errorConfig)
    return op.failure({
      code: "Validation",
      message: "Invalid agent server config.",
      cause: errorConfig,
    });

  // Produce the client-side subset config
  const { error: errorClientConfig, data: clientConfig } =
    agentClientConfigSchema.safeParse(serverConfig);
  if (errorClientConfig)
    return op.failure({
      code: "Validation",
      message: "Invalid agent client config.",
      cause: errorClientConfig,
    });

  return op.success({ server: serverConfig, client: clientConfig });
}
