import { LivekitEOU } from "./providers/livekit";
import { TurnSenseEOU } from "./providers/turnsense";

export const eouProviders = {
  turnsense: TurnSenseEOU,
  livekit: LivekitEOU,
} as const;
