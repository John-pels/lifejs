import type { sttProviders } from "./provider";

export type STTProvider = (typeof sttProviders)[keyof typeof sttProviders];
