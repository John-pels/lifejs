import z from "zod";
import { messageSchema } from "./messages";
import { statusSchema } from "./status";
import type { ContextDefinition } from "./types";

export const contextDefinition = z.object({
  /**
   * The entire history of messages handled by the generation plugin.
   */
  messages: z.array(messageSchema).prefault([]),
  /**
   * The current generation status.
   * Contains { listening, thinking, speaking } flags.
   */
  status: statusSchema,
  /**
   * Whether the generation plugin should generate and stream voice back
   * to the user. If true, solely text chunks will be emitted.
   */
  voiceEnabled: z.boolean().prefault(true),
}) satisfies ContextDefinition;
