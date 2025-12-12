import z from "zod";
import * as op from "@/shared/operation";

export const statusSchema = z
  .object({
    listening: z.boolean().prefault(true),
    thinking: z.boolean().prefault(false),
    speaking: z.boolean().prefault(false),
  })
  .prefault({});

export type Status = z.infer<typeof statusSchema>;

export const computeStatus = (oldStatus: Status, eventType: string) => {
  try {
    if (eventType === "agent.thinking-start")
      return op.success({ ...oldStatus, listening: false, thinking: true });
    if (eventType === "agent.thinking-end") return op.success({ ...oldStatus, thinking: false });
    if (eventType === "agent.speaking-end")
      return op.success({ ...oldStatus, listening: true, thinking: false, speaking: false });
    if (eventType === "agent.speaking-start")
      return op.success({ ...oldStatus, listening: false, speaking: true });
    return op.success(oldStatus);
  } catch (error) {
    return op.failure({ code: "Unknown", cause: error });
  }
};
