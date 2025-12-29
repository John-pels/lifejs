// @ts-nocheck
// biome-ignore-all lint: reason

import { $ } from "bun";
import z from "zod";
import type { LifeErrorUnion } from "@/shared/error";
import { createMessageInputSchema, messageSchema, updateMessageInputSchema } from "../../messages";
import type { EventsDefinition } from "../../types";

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

const generationEventDataSchema = z.object({
  preventInterruption: z.boolean().prefault(false),
});

// Definition
export const eventsDefinition = [
  { name: "start", dataSchema: z.object({ isRestart: z.boolean().prefault(false) }) },
  { name: "stop" },
  {
    name: "error",
    dataSchema: z.object({ error: z.custom<LifeErrorUnion>(), event: eventSchema }),
  },
  { name: "add-message", dataSchema: z.object({ message: createMessageInputSchema }) },
  {
    name: "update-message",
    dataSchema: z.object({ id: z.string(), message: updateMessageInputSchema }),
  },
  { name: "remove-message", dataSchema: z.object({ id: z.string() }) },
  { name: "incoming-audio", dataSchema: z.object({ chunk: z.custom<Int16Array>() }) },
  { name: "incoming-voice-start" },
  {
    name: "incoming-voice",
    dataSchema: z.discriminatedUnion("type", [
      z.object({ type: z.literal("voice"), chunk: z.custom<Int16Array>() }),
      z.object({
        type: z.literal("padding"),
        chunk: z.custom<Int16Array>(),
        paddingSide: z.enum(["pre", "post"]),
        paddingIndex: z.number(),
      }),
    ]),
  },
  { name: "incoming-voice-end" },
  { name: "incoming-text", dataSchema: z.object({ chunk: z.string() }) },
  {
    name: "interrupt",
    dataSchema: z.object({
      author: z.enum(["user", "application"]),
      reason: z.string(),
    }),
  },
  { name: "continue", dataSchema: generationEventDataSchema },
  {
    name: "decide",
    dataSchema: generationEventDataSchema.extend({ hint: z.string().optional() }),
  },
  { name: "say", dataSchema: generationEventDataSchema.extend({ content: z.string() }) },
  {
    name: "interruption",
    dataSchema: z.object({
      author: z.enum(["user", "application"]),
      reason: z.string(),
    }),
  },
  { name: "outgoing-text", dataSchema: z.object({ chunk: z.string() }) },
  { name: "outgoing-reasoning", dataSchema: z.object({ chunk: z.string() }) },
  {
    name: "outgoing-tool-result",
    dataSchema: z.object({
      id: z.string(),
      name: z.string(),
      result: z.any(),
    }),
  },
  { name: "outgoing-voice-start" },
  { name: "outgoing-voice", dataSchema: z.object({ chunk: z.custom<Int16Array>() }) },
  { name: "outgoing-voice-end" },
  { name: "start-text-generation-job", dataSchema: z.object({ id: z.string() }) },
  { name: "stop-text-generation-job", dataSchema: z.object({ id: z.string() }) },
  { name: "start-voice-generation-job", dataSchema: z.object({ id: z.string() }) },
  { name: "stop-voice-generation-job", dataSchema: z.object({ id: z.string() }) },

  // { name: "user.audio-chunk", dataSchema: z.object({ audioChunk: z.custom<Int16Array>() }) },
  // { name: "user.voice-start" },
  // {
  //   name: "user.voice-chunk",
  //   dataSchema: z.discriminatedUnion("type", [
  //     z.object({ type: z.literal("voice"), voiceChunk: z.custom<Int16Array>() }),
  //     z.object({
  //       type: z.literal("padding"),
  //       voiceChunk: z.custom<Int16Array>(),
  //       paddingSide: z.enum(["pre", "post"]),
  //       paddingIndex: z.number(),
  //     }),
  //   ]),
  // },
  // { name: "user.voice-end" },
  // { name: "user.text-chunk", dataSchema: z.object({ textChunk: z.string() }) },
  // { name: "user.interrupted" },

  // { name: "agent.thinking-start" },
  // { name: "agent.thinking-end" },
  // { name: "agent.speaking-start" },
  // { name: "agent.speaking-end" },
  // { name: "agent.continue", dataSchema: insertEventBaseSchema },
  // {
  //   name: "agent.decide",
  //   dataSchema: insertEventBaseSchema.extend({ messages: z.array(messageSchema) }),
  // },
  // {
  //   name: "agent.say",
  //   dataSchema: insertEventBaseSchema.extend({ text: z.string() }),
  // },
  // {
  //   name: "agent.interrupt",
  //   dataSchema: z.object({
  //     reason: z.string(),
  //     author: z.enum(["user", "application"]),
  //     force: z.boolean().prefault(false),
  //   }),
  // },
  // {
  //   name: "agent.interrupted",
  //   dataSchema: z.object({
  //     reason: z.string(),
  //     forced: z.boolean(),
  //     author: z.enum(["user", "application"]),
  //   }),
  // },
  // { name: "agent.text-chunk", dataSchema: z.object({ textChunk: z.string() }) },
  // { name: "agent.voice-chunk", dataSchema: z.object({ voiceChunk: z.custom<Int16Array>() }) },
] as const satisfies EventsDefinition;
