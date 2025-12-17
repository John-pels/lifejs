import type { z } from "zod";
import { AsyncQueue } from "@/shared/async-queue";
import { newId } from "@/shared/id";
import type * as op from "@/shared/operation";
import type { VADChunk, VADJob } from "../types";

export abstract class VADProviderBase<ConfigSchema extends z.ZodObject> {
  protected config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  protected createGenerateJob(): VADJob {
    const id = newId("job");
    const stream = new AsyncQueue<VADChunk>();
    const _abortController = new AbortController();
    const job: VADJob = {
      id,
      cancel: () => _abortController.abort(),
      stream,
      inputVoice: (pcm: Int16Array) => {
        if (_abortController.signal.aborted) return;
        this.receiveVoice(job, pcm);
      },
      _abortController,
    };
    return job;
  }

  abstract detect(): Promise<op.OperationResult<VADJob>>;

  protected abstract receiveVoice(job: VADJob, pcm: Int16Array): Promise<void>;
}
