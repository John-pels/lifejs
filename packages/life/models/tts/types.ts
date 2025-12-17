import type { AsyncQueue } from "@/shared/async-queue";
import type { ttsProviders } from "./provider";

export type TTSChunk =
  | { type: "content"; voiceChunk: Int16Array; textChunk: string; durationMs: number }
  | { type: "end" }
  | { type: "error"; error: string };

export type TTSChunkInput =
  | { type: "content"; voiceChunk: Int16Array }
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

export type TTSProvider = (typeof ttsProviders)[keyof typeof ttsProviders];
