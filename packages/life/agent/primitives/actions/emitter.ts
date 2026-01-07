import z from "zod";
import type { EventEmitterDefinition } from "@/shared/event-emitter/types";

export const emitterDefinition = [
  { name: "execution-started", dataSchema: z.object({ input: z.unknown() }) },
  { name: "execution-completed", dataSchema: z.object({ output: z.unknown() }) },
  { name: "execution-failed", dataSchema: z.object({ error: z.unknown() }) },
] as const satisfies EventEmitterDefinition;
