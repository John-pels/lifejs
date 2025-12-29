import type { AsyncQueue } from "@/shared/async-queue";

export type TTSChunk =
  | { type: "content"; voice: Int16Array; text: string; durationMs: number }
  | { type: "end" }
  | { type: "error"; error: string };

export type TTSChunkInput =
  | { type: "content"; voice: Int16Array }
  | { type: "end" }
  | { type: "error"; error: string };

export interface TTSJob {
  id: string;
  stream: AsyncQueue<TTSChunk>;
  cancel: () => void;
  inputText: (text: string, isLast?: boolean) => Promise<void>;
  _abortController: AbortController;
  _receiveVoiceChunk: (chunk: TTSChunkInput) => Promise<void>;
}
