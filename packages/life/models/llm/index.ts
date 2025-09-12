import { createConfigUnion } from "@/shared/config";
import { MistralLLM, mistralLLMConfig } from "./providers/mistral";
import { OpenAILLM, openAILLMConfig } from "./providers/openai";
import { XaiLLM, xaiLLMConfig } from "./providers/xai";

// Providers
export const llmProviders = {
  mistral: { class: MistralLLM, configSchema: mistralLLMConfig },
  openai: { class: OpenAILLM, configSchema: openAILLMConfig },
  xai: { class: XaiLLM, configSchema: xaiLLMConfig },
} as const;

export type LLMProvider = (typeof llmProviders)[keyof typeof llmProviders]["class"];

// Config
export const llmProviderConfig = createConfigUnion("provider", [
  mistralLLMConfig,
  openAILLMConfig,
  xaiLLMConfig,
]);
