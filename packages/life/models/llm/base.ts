import type { z } from "zod";
import { AsyncQueue } from "@/shared/async-queue";
import type * as op from "@/shared/operation";
import { newId } from "@/shared/prefixed-id";
import type { Message, ToolDefinition, ToolRequests } from "@/shared/resources";

// LLMBase.generateMessage()
export type LLMGenerateMessageStreamChunk =
  | { type: "content"; content: string }
  | { type: "tools"; tools: ToolRequests }
  | { type: "end" }
  | { type: "error"; error: string };

export interface LLMGenerateMessageJob {
  id: string;
  cancel: () => void;
  getStream: () => AsyncQueue<LLMGenerateMessageStreamChunk>;
  raw: {
    asyncQueue: AsyncQueue<LLMGenerateMessageStreamChunk>;
    abortController: AbortController;
    receiveChunk: (chunk: LLMGenerateMessageStreamChunk) => void;
  };
}

/**
 * Base class for all LLMs providers.
 */
export abstract class LLMBase<ConfigSchema extends z.ZodObject<any, any>> {
  config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  protected createGenerateMessageJob(): LLMGenerateMessageJob {
    const queue = new AsyncQueue<LLMGenerateMessageStreamChunk>();
    const job: LLMGenerateMessageJob = {
      id: newId("job"),
      getStream: () => queue,
      cancel: () => job.raw.abortController.abort(),
      raw: {
        asyncQueue: queue,
        abortController: new AbortController(),
        receiveChunk: (chunk: LLMGenerateMessageStreamChunk) => queue.push(chunk),
      },
    };
    return job;
  }

  // To be implemented by subclasses
  abstract generateMessage(params: {
    messages: Message[];
    tools: ToolDefinition[];
  }): Promise<op.OperationResult<LLMGenerateMessageJob>>;

  abstract generateObject<T extends z.ZodObject<any, any>>(params: {
    messages: Message[];
    schema: T;
  }): Promise<op.OperationResult<z.infer<T>>>;
}
