import { maintainMessagesHandler } from "./2-maintain-messages";
import { maintainStatusHandler } from "./1-maintain-status";
import { receiveAudioHandler } from "./3-receive-audio";
import { detectVoiceHandler } from "./4-detect-voice";
import { transcribeVoiceHandler } from "./5-transcribe-voice";
import { detectEndOfTurnHandler } from "./6-detect-end-of-turn";
import { streamVoiceHandler } from "./9-stream-voice";

export const handlersDefinition = [
  maintainStatusHandler,
  maintainMessagesHandler,
  receiveAudioHandler,
  detectVoiceHandler,
  transcribeVoiceHandler,
  detectEndOfTurnHandler,
  /*
  - Receive continue, decide, say and interrupt events
  */
  //
  // - Generate memories
  // - Exectute actions
  // - Apply effects
  // - Update stores
  // - etc.
  //
  streamVoiceHandler,
] as const;
