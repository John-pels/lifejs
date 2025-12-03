import { definePlugin } from "life/server";
import z from "zod";

export const testPlugin = definePlugin("test")
  .config({
    schema: z.object({
      items: z.array(z.string()).prefault([]),
    }),
  })
  .events(
    { name: "event1", dataSchema: z.object({ name: z.string() }) },
    { name: "event2", dataSchema: z.object({ name: z.string() }) },
  );
