import type { z } from "zod";
import type { Message } from "@/agent/messages";
import { AsyncQueue } from "@/shared/async-queue";
import { newId } from "@/shared/id";
import type * as op from "@/shared/operation";

export interface LLMTool {
  name: string;
  description: string;
  schema: {
    input: z.ZodObject;
    output: z.ZodObject;
  };
  run: (input: Record<string, unknown>) => unknown;
}

export interface LLMToolRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type LLMChunk =
  | { type: "content"; content: string }
  | { type: "tools"; tools: LLMToolRequest[] }
  | { type: "error"; error: string }
  | { type: "end" };

export interface LLMJob {
  id: string;
  cancel: () => void;
  stream: AsyncQueue<LLMChunk>;
  _abortController: AbortController;
}

export abstract class LLMBase<ConfigSchema extends z.ZodObject> {
  config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  protected createGenerateMessageJob(): LLMJob {
    const id = newId("job");
    const stream = new AsyncQueue<LLMChunk>();
    const _abortController = new AbortController();
    const job: LLMJob = {
      id,
      stream,
      cancel: () => _abortController.abort(),
      _abortController,
    };
    return job;
  }

  abstract generateMessage(params: { messages: Message[]; tools: LLMTool[] }): Promise<LLMJob>;

  abstract generateObject<T extends z.ZodObject>(params: {
    messages: Message[];
    schema: T;
  }): Promise<op.OperationResult<z.infer<T>>>;
}
