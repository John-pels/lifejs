import type z from "zod";
import type { AsyncQueue } from "@/shared/async-queue";
import type { llmConfigSchema, llmModelConfigSchema } from "./config";

export type LLMModelConfig = z.infer<typeof llmModelConfigSchema>;
export type LLMConfig<T extends "input" | "output" = "output"> = T extends "input"
  ? z.input<typeof llmConfigSchema>
  : z.output<typeof llmConfigSchema>;

export interface LLMTool {
  name: string;
  description: string;
  schema: {
    input: z.ZodObject;
    output: z.ZodObject;
  };
  execute: (input: Record<string, unknown>) => unknown;
}

export interface LLMToolRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type LLMChunk =
  | { type: "content"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "tools"; tools: LLMToolRequest[] }
  | { type: "error"; error: string }
  | { type: "end" };

export interface LLMJob {
  id: string;
  cancel: () => void;
  stream: AsyncQueue<LLMChunk>;
  ended: boolean;
  _abortController: AbortController;
}
