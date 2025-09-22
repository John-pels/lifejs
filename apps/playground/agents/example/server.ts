import { defaults, defineAgent } from "life/server";
import z from "zod";
import { testPlugin } from "./plugins/test/server";

export default defineAgent("example")
  .plugins([...defaults.plugins, testPlugin])
  .scope({
    schema: z.object({
      userId: z.string(),
    }),
    hasAccess: ({ request, scope }) => {
      return request.headers.get("Authorization") === scope.userId;
    },
  })
  .test({
    items: ["item1", "item3"] as const,
  })
  .generation({
    collections: ["collection1", "collection2"],
    tools: [
      {
        name: "get-weather",
        description: "Get the weather for a given location",
        schema: {
          input: z.object({
            location: z.string(),
          }),
          output: z.object({
            weather: z.string(),
          }),
        },
        run: async ({ location }) => {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return {
            success: true,
            output: {
              summary: `It's raining in ${location}.`,
            },
          };
        },
      },
    ],
  });
//
