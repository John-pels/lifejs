import * as op from "@/shared/operation";
import type { Status } from "../../../types";
import { defineHandler } from "./define";

const computeStatus = (old: Status, eventType: string) => {
  if (eventType === "agent.thinking-start") return { ...old, listening: false, thinking: true };
  if (eventType === "agent.thinking-end") return { ...old, thinking: false };
  if (eventType === "agent.speaking-end")
    return { ...old, listening: true, thinking: false, speaking: false };
  if (eventType === "agent.speaking-start") return { ...old, listening: false, speaking: true };
  return old;
};

// Re-compute status based on events
export const maintainStatusHandler = defineHandler({
  name: "maintain-status",
  mode: "block",
  onEvent: ({ context, event }) => {
    if (!/^agent\.(thinking|speaking)/.test(event.name)) return op.success();
    const [errGet, contextValue] = context.get();
    if (errGet) return op.failure(errGet);
    const status = computeStatus(contextValue.status, event.name);
    const [errSet] = context.set((ctx) => ({ ...ctx, status }));
    if (errSet) return op.failure(errSet);
    return op.success();
  },
});
