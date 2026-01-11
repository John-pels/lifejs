import { AssemblySTT } from "./providers/assembly";
import { DeepgramSTT } from "./providers/deepgram";
import { GoogleSTT } from "./providers/google";
import { OpenAISTT } from "./providers/openai";

export const sttProviders = {
  deepgram: DeepgramSTT,
  openai: OpenAISTT,
  google: GoogleSTT,
  assembly: AssemblySTT,
} as const;
