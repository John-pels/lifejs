import type { z } from "zod";
import { AsyncQueue } from "@/shared/async-queue";
import { newId } from "@/shared/id";

export interface VADChunk {
  type: "result";
  chunk: Int16Array;
  score: number;
}

export interface VADJob {
  id: string;
  cancel: () => void;
  stream: AsyncQueue<VADChunk>;
  inputVoice: (pcm: Int16Array) => void;
  _abortController: AbortController;
}

export abstract class VADBase<ConfigSchema extends z.ZodObject> {
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
      inputVoice: (pcm: Int16Array) => this.receiveVoice(job, pcm),
      _abortController,
    };
    return job;
  }

  abstract detect(): Promise<VADJob>;

  protected abstract receiveVoice(job: VADJob, pcm: Int16Array): Promise<void>;
}
