import z from "zod";
import type { EventEmitterDefinition } from "@/shared/event-emitter/types";

export const emitterDefinition = [
  { name: "change", dataSchema: z.object({ newValue: z.unknown(), oldValue: z.unknown() }) },
] as const satisfies EventEmitterDefinition;
