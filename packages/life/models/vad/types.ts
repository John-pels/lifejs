import type { AsyncQueue } from "@/shared/async-queue";

export interface VADChunk {
  type: "result";
  voice: Int16Array;
  score: number;
}

export interface VADJob {
  id: string;
  cancel: () => void;
  stream: AsyncQueue<VADChunk>;
  inputVoice: (pcm: Int16Array) => void;
  _abortController: AbortController;
}
