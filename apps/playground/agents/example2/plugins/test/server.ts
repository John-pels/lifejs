import { definePlugin } from "life/server";
import z from "zod";

export const testPlugin = definePlugin("test")
  .config(
    z.object({
      items: z.array(z.string()),
    }),
  )
  .events({
    event1: { dataSchema: z.object({ name: z.string() }) },
    event2: { dataSchema: z.object({ name: z.string() }) },
  });
// .methods({
//   test: {
//     schema: z.function().args(z.void()).returns(z.string()),
//     run: () => "test",
//   },
// });
//
//
