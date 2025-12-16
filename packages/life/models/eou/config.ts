import z from "zod";
import { livekitEOUConfig } from "./providers/livekit";
import { turnSenseEOUConfig } from "./providers/turnsense";

export const eouConfigSchema = z.discriminatedUnion("provider", [
  livekitEOUConfig,
  turnSenseEOUConfig,
]);
