import z from "zod";
import type { EventEmitterDefinition } from "@/shared/event-emitter/types";
import { messageSchema } from "@/shared/messages";
import { memoryPositionSchema } from "./schemas";

export const emitterDefinition = [
  {
    name: "messagesChange",
    dataSchema: z.object({ messages: z.array(messageSchema) }),
  },
  {
    name: "positionChange",
    dataSchema: z.object({ position: memoryPositionSchema }),
  },
  { name: "enabledChange", dataSchema: z.object({ enabled: z.boolean() }) },
] as const satisfies EventEmitterDefinition;
