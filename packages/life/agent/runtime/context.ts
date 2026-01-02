import z from "zod";
import { messageSchema } from "@/shared/messages";
import type { ContextDefinition } from "./types";

export const statusSchema = z
  .object({
    listening: z.boolean().prefault(true),
    thinking: z.boolean().prefault(false),
    speaking: z.boolean().prefault(false),
  })
  .prefault({});

export const contextDefinition = z.object({
  /**
   * The conversation history.
   */
  messages: z.array(messageSchema).prefault([]),
  /**
   * The current agent status.
   * Contains { listening, thinking, speaking } flags.
   */
  status: statusSchema,
  /**
   * Whether the agent should generate and stream voice back
   * to the user. If false, solely text chunks will be emitted.
   */
  voiceEnabled: z.boolean().prefault(true),
}) satisfies ContextDefinition;
