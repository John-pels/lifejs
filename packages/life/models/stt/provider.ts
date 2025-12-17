import { DeepgramSTT } from "./providers/deepgram";

export const sttProviders = {
  deepgram: DeepgramSTT,
} as const;
