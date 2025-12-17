import type { z } from "zod";
import { AsyncQueue } from "@/shared/async-queue";
import { audioChunkToMs } from "@/shared/audio-chunk-to-ms";
import { newId } from "@/shared/id";
import type * as op from "@/shared/operation";
import { WeightedAverage } from "@/shared/weighted-average";
import { speechDurationTokenizer } from "./lib/speech-duration-tokenizer";
import { speechTokenizer } from "./lib/speech-tokenizer";
import type { TTSChunk, TTSChunkInput, TTSJob } from "./types";

export abstract class TTSProviderBase<ConfigSchema extends z.ZodObject> {
  config: z.infer<ConfigSchema>;

  /** Resolves when warmup is complete */
  readonly warmedUp: Promise<void>;

  /** ms per token */
  readonly #pace = new WeightedAverage(200); // 200ms per token is a good default
  readonly #jobsFullText: Record<string, string> = {};
  readonly #jobsFullAudio: Record<string, Int16Array> = {};
  readonly #jobsLastTaken: Record<string, string> = {};
  readonly #jobsInputTokensCount: Record<string, number> = {};

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });

    this.warmedUp = (async () => {
      // Start an initial short generation to set the pace
      const [error1, job1] = await this.generate();
      if (error1) return;
      await job1.inputText("Hello, I'm an agent.", true);
      for await (const chunk of job1.stream) if (chunk.type === "end") break;

      // Then start a longer initial generation to obtain a more precise pace
      const [error2, job2] = await this.generate();
      if (error2) return;
      const text = "Isn't Life beautiful? The Typescript framework? This is a **demo sentence**.";
      await job2.inputText(text, true);
      for await (const chunk of job2.stream) if (chunk.type === "end") break;
    })();
  }

  protected createGenerateJob(): TTSJob {
    const id = newId("job");
    const stream = new AsyncQueue<TTSChunk>();
    const _abortController = new AbortController();

    // Create the job
    const job: TTSJob = {
      id,
      stream,
      cancel: () => _abortController.abort(),
      inputText: async (text: string, isLast = false) => {
        if (_abortController.signal.aborted) return;

        // Append the text chunk to the full text
        if (!this.#jobsFullText[id]) this.#jobsFullText[id] = "";
        this.#jobsFullText[id] += text;

        // Tokenize the full text
        const [errTokens, speechTokens] = await speechTokenizer.tokenize(this.#jobsFullText[id]);
        if (errTokens) throw new Error(errTokens.message);

        // Retrieve the tokens delta
        const deltaTokens = speechTokens.slice(this.#jobsInputTokensCount[id] ?? 0);
        this.#jobsInputTokensCount[id] = speechTokens.length;

        // Call the subclass callback
        const inputText = deltaTokens.map((t) => t.value).join("");
        await this.receiveText(job, inputText, isLast);
      },
      _abortController,
      _receiveVoiceChunk: async (inputChunk: TTSChunkInput) => {
        const chunk = inputChunk as TTSChunk;

        if (chunk.type === "content") {
          // Append the voice chunk to the full audio
          if (!this.#jobsFullAudio[id]) this.#jobsFullAudio[id] = new Int16Array(0);
          const fullAudio = [...(this.#jobsFullAudio[id] ?? []), ...chunk.voiceChunk];
          this.#jobsFullAudio[id] = new Int16Array(fullAudio);

          // Estimate the number of tokens to take
          const totalVoiceDurationMs = audioChunkToMs(this.#jobsFullAudio[id]);
          const tokensCount = Math.floor(totalVoiceDurationMs / this.#pace.average);

          // Convert taken tokens back to text
          const fullText = this.#jobsFullText[id] ?? "";
          const [errTaken, newTaken] = await speechDurationTokenizer.take(fullText, tokensCount);
          if (errTaken) throw errTaken;

          // Find whether the newTaken text is a continuation of the lastTaken text
          // If it is not, it means that the pace has changed, and lastTaken is ahead of newTaken
          const lastTaken = this.#jobsLastTaken[id] ?? "";
          const isContinuation = newTaken.length >= lastTaken.length;

          // Compute the text chunk to emit
          chunk.textChunk = isContinuation ? newTaken.slice(lastTaken.length) : "";
          if (isContinuation) this.#jobsLastTaken[id] = newTaken;

          // Estimate the voice chunk duration
          const voiceDurationMs = audioChunkToMs(chunk.voiceChunk);
          chunk.durationMs = voiceDurationMs;
        }

        // Handle end chunks
        if (chunk.type === "end") {
          // If some text remains, push those to queue with empty audio
          const remainingText = (this.#jobsFullText[id] ?? "").replace(
            this.#jobsLastTaken[id] ?? "",
            "",
          );
          if (remainingText.trimEnd().length) {
            stream.push({
              type: "content",
              voiceChunk: new Int16Array(0),
              textChunk: remainingText,
              durationMs: 0,
            });
          }

          // Retrieve the job's full text and audio
          const fullText = this.#jobsFullText[id] as string;
          const fullAudio = this.#jobsFullAudio[id] as Int16Array;

          // Compute full text tokens, and audio duration
          const [errTokensCount, durationTokens] = await speechDurationTokenizer.tokenize(fullText);
          if (errTokensCount) throw errTokensCount;
          const duration = audioChunkToMs(fullAudio);
          const msPerToken = duration / durationTokens.length;

          // Update weighted average with this completed job
          this.#pace.add(msPerToken, duration);

          // Clean up job data
          this.#jobsFullText[id] = "";
          this.#jobsLastTaken[id] = "";
          this.#jobsFullAudio[id] = new Int16Array(0);
          this.#jobsInputTokensCount[id] = 0;
        }

        // Handle error chunks
        if (chunk.type === "error") {
          // Clean up on error
          this.#jobsFullText[id] = "";
          this.#jobsLastTaken[id] = "";
          this.#jobsFullAudio[id] = new Int16Array(0);
          this.#jobsInputTokensCount[id] = 0;
        }

        // Push the chunk to the queue
        stream.push(chunk as TTSChunk);
      },
    };
    return job;
  }

  abstract generate(): Promise<op.OperationResult<TTSJob>>;

  protected abstract receiveText(job: TTSJob, text: string, isLast: boolean): Promise<void>;
}
