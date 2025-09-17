import type { z } from "zod";
import { AsyncQueue } from "@/shared/async-queue";
import { newId } from "@/shared/prefixed-id";

// STTBase.generate()
export type STTGenerateStreamChunk =
  | { type: "content"; textChunk: string }
  | { type: "end" }
  | { type: "error"; error: string };

export type STTGenerateJob = {
  id: string;
  cancel: () => void;
  getStream: () => AsyncQueue<STTGenerateStreamChunk>;
  pushVoice: (pcm: Int16Array) => void;
  raw: {
    asyncQueue: AsyncQueue<STTGenerateStreamChunk>;
    abortController: AbortController;
    receiveChunk: (chunk: STTGenerateStreamChunk) => void;
  };
};

/**
 * Base class for all STT providers.
 */
export abstract class STTBase<ConfigSchema extends z.ZodObject> {
  protected config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  protected createGenerateJob(): STTGenerateJob {
    const queue = new AsyncQueue<STTGenerateStreamChunk>();
    const jobId = newId("job");
    const job: STTGenerateJob = {
      id: jobId,
      cancel: () => job.raw.abortController.abort(),
      getStream: () => queue,
      pushVoice: (pcm: Int16Array) => {
        this._onGeneratePushVoice(job, pcm);
      },
      raw: {
        asyncQueue: queue,
        abortController: new AbortController(),
        receiveChunk: (chunk: STTGenerateStreamChunk) => {
          job.raw.asyncQueue.push(chunk);
        },
      },
    };

    return job;
  }

  // To be impemented by subclasses
  abstract generate(): Promise<STTGenerateJob>;
  protected abstract _onGeneratePushVoice(job: STTGenerateJob, pcm: Int16Array): Promise<void>;
}
