import z from "zod";
import type { LifeError } from "@/shared/error";
import type { EventEmitterDefinition } from "@/shared/event-emitter/types";

export const emitterDefinition = [
  { name: "mounted", dataSchema: z.object({ inMs: z.number() }) },
  { name: "unmounted", dataSchema: z.object({ inMs: z.number() }) },
  { name: "mountError", dataSchema: z.object({ error: z.custom<LifeError>() }) },
  { name: "unmountError", dataSchema: z.object({ error: z.custom<LifeError>() }) },
] as const satisfies EventEmitterDefinition;
