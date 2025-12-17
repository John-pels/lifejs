import z from "zod";
import type { LifeErrorUnion } from "@/shared/error";
import { createMessageInputSchema, messageSchema } from "./messages";
import type { EventsDefinition } from "./types";

// Schemas
export const eventSourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("server"),
    handler: z.string().optional(),
    event: z.string().optional(),
  }),
  z.object({ type: z.literal("client") }),
]);

export const eventSchema = z.object({
  id: z.string(),
  name: z.string(),
  urgent: z.boolean().prefault(false),
  data: z.any().prefault(null),
  created: z.object({ at: z.number(), by: eventSourceSchema }),
  contextChanges: z
    .array(
      z.object({
        at: z.number(),
        byHandler: z.string(),
        value: z.object({ before: z.any(), after: z.any() }),
      }),
    )
    .prefault([]),
});

export const eventInputSchema = eventSchema.omit({ id: true, created: true, contextChanges: true });

// Definitions
export const eventsDefinition = [
  { name: "agent.start", dataSchema: z.object({ isRestart: z.boolean().prefault(false) }) },
  { name: "agent.stop" },
  {
    name: "agent.error",
    dataSchema: z.object({ error: z.custom<LifeErrorUnion>(), event: eventSchema }),
  },
  { name: "messages.create", dataSchema: z.object({ message: createMessageInputSchema }) },
  {
    name: "messages.update",
    dataSchema: z.object({
      id: z.string(),
      role: z.enum(["user", "system", "agent", "tool"]),
      message: createMessageInputSchema,
    }),
  },
  { name: "message.hide", dataSchema: z.object({ id: z.string() }) },
  { name: "user.audio-chunk", dataSchema: z.object({ audioChunk: z.custom<Int16Array>() }) },
  { name: "user.voice-start" },
  {
    name: "user.voice-chunk",
    dataSchema: z.discriminatedUnion("type", [
      z.object({ type: z.literal("voice"), voiceChunk: z.custom<Int16Array>() }),
      z.object({
        type: z.literal("padding"),
        voiceChunk: z.custom<Int16Array>(),
        paddingSide: z.enum(["pre", "post"]),
        paddingIndex: z.number(),
      }),
    ]),
  },
  { name: "user.voice-end" },
  { name: "user.text-chunk", dataSchema: z.object({ textChunk: z.string() }) },
  { name: "user.interrupted" },

  { name: "agent.thinking-start" },
  { name: "agent.thinking-end" },
  { name: "agent.speaking-start" },
  { name: "agent.speaking-end" },
  { name: "agent.continue", dataSchema: insertEventBaseSchema },
  {
    name: "agent.decide",
    dataSchema: insertEventBaseSchema.extend({ messages: z.array(messageSchema) }),
  },
  {
    name: "agent.say",
    dataSchema: insertEventBaseSchema.extend({ text: z.string() }),
  },
  {
    name: "agent.interrupt",
    dataSchema: z.object({
      reason: z.string(),
      author: z.enum(["user", "application"]),
      force: z.boolean().prefault(false),
    }),
  },
  //   { name: "agent.resources-request" },
  //   {
  //     name: "agent.resources-response",
  //     dataSchema: z.object({ requestId: z.string(), resources: llmResourcesSchema }),
  //   },
  //   {
  //     name: "agent.tool-requests",
  //     dataSchema: z.object({ requests: z.array(agentToolRequestSchema) }),
  //   },
  {
    name: "agent.interrupted",
    dataSchema: z.object({
      reason: z.string(),
      forced: z.boolean(),
      author: z.enum(["user", "application"]),
    }),
  },
  { name: "agent.text-chunk", dataSchema: z.object({ textChunk: z.string() }) },
  { name: "agent.voice-chunk", dataSchema: z.object({ voiceChunk: z.custom<Int16Array>() }) },
] as const satisfies EventsDefinition;
