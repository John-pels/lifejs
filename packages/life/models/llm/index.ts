import { z } from "zod";
import { createConfig } from "@/shared/config";
import { MistralLLM, mistralLLMConfig } from "./providers/mistral";
import { OpenAILLM, openAILLMConfig } from "./providers/openai";
import { XaiLLM, xaiLLMConfig } from "./providers/xai";

// Providers
export const llmProviders = {
  mistral: { class: MistralLLM, configSchema: mistralLLMConfig.serverSchema },
  openai: { class: OpenAILLM, configSchema: openAILLMConfig.serverSchema },
  xai: { class: XaiLLM, configSchema: xaiLLMConfig.serverSchema },
} as const;

export type LLMProvider = (typeof llmProviders)[keyof typeof llmProviders]["class"];

// Config
export const llmProviderConfig = createConfig({
  serverSchema: z.discriminatedUnion("provider", [
    mistralLLMConfig.serverSchema,
    openAILLMConfig.serverSchema,
    xaiLLMConfig.serverSchema,
  ]),
  clientSchema: z.object({}),
});
