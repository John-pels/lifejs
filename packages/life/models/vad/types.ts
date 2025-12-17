import type { AsyncQueue } from "@/shared/async-queue";
import type { vadProviders } from ".";

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

export type VADProvider = (typeof vadProviders)[keyof typeof vadProviders];
