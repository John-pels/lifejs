import { definePlugin } from "life/server";
import z from "zod";

export const testPlugin = definePlugin("test")
  .config({
    schema: z.object({
      items: z.array(z.string()).prefault([]),
    }),
    toTelemetryAttribute: (data) => data,
  })
  .events({
    event1: { dataSchema: z.object({ name: z.string() }) },
    event2: { dataSchema: z.object({ name: z.string() }) },
  })
  .methods({
    test: {
      schema: {
        input: z.object({}),
        output: z.object({
          name: z.string(),
        }),
      },
      run: () => ({
        name: "test",
      }),
    },
  });
