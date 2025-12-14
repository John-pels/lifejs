import type { LanguageModel } from "ai";
import z from "zod";

export const llmModelConfigSchema = z.object({
  model: z.custom<LanguageModel>().optional(),
  headers: z.record(z.string(), z.string()).optional().prefault({}),
  frequencyPenalty: z.number().optional(),
  presencePenalty: z.number().optional(),
  seed: z.number().optional(),
  temperature: z.number().optional(),
  topK: z.number().optional(),
  topP: z.number().optional(),
  /**
   * Provider-specific options (e.g., Anthropic extended thinking)
   */
  providerOptions: z.record(z.string(), z.any()).optional(),
});

export const llmConfigSchema = llmModelConfigSchema.extend({
  fallbacks: z.array(llmModelConfigSchema).prefault([]),
});
