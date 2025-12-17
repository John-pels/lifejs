import type { z } from "zod";
import { AsyncQueue } from "@/shared/async-queue";
import { newId } from "@/shared/id";
import type * as op from "@/shared/operation";
import type { STTChunk, STTJob } from "../types";

export abstract class STTProviderBase<ConfigSchema extends z.ZodObject> {
  protected config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  protected createGenerateJob(): STTJob {
    const id = newId("job");
    const stream = new AsyncQueue<STTChunk>();
    const _abortController = new AbortController();
    const job: STTJob = {
      id,
      stream,
      inputVoice: (pcm: Int16Array) => {
        if (_abortController.signal.aborted) return;
        this.receiveVoice(job, pcm);
      },
      cancel: () => _abortController.abort(),
      _abortController,
    };
    return job;
  }

  abstract generate(): Promise<op.OperationResult<STTJob>>;

  protected abstract receiveVoice(job: STTJob, pcm: Int16Array): Promise<void>;
}
