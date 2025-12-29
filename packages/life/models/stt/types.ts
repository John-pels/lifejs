import type { AsyncQueue } from "@/shared/async-queue";
import type { sttProviders } from ".";

export type STTProvider = (typeof sttProviders)[keyof typeof sttProviders];

export type STTChunk =
  | { type: "content"; text: string }
  | { type: "error"; error: string }
  | { type: "end" };

export interface STTJob {
  id: string;
  stream: AsyncQueue<STTChunk>;
  cancel: () => void;
  inputVoice: (chunk: Int16Array) => void;
  _abortController: AbortController;
}
