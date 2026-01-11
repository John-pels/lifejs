import { CartesiaTTS } from "./providers/cartesia";
import { ElevenLabsTTS } from "./providers/elevenlabs";
import { GoogleTTS } from "./providers/google";
import { OpenAITTS } from "./providers/openai";

export const ttsProviders = {
  cartesia: CartesiaTTS,
  openai: OpenAITTS,
  elevenlabs: ElevenLabsTTS,
  google: GoogleTTS,
} as const;
