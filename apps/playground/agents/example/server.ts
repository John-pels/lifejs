import { defaults, defineAgent } from "life/server";
import { testPlugin } from "./plugins/test/server";

export default defineAgent("example")
  // Register the default plugins offered by Life.js (We'll talk more on plugins later!)
  .plugins([...defaults.plugins, testPlugin]);
// .test({
//   items: ["item1", "item2"],
// }); // NO TS ERROR HERE
// .scope({
//   schema: z.object({
//     userId: z.string(),
//   }),
//   hasAccess: ({ request, scope }) => request.headers.get("Authorization") === scope.userId,
// })

// Memories are a 1:1 interface on-top of context window
// .memories({
//   items: [

//     // We start by adding a
//     // defaults.memories.instructions({
//     //   role: "You're a helpful assistant.",
//     //   context: "You're part of an application called Life.js.",
//     // }),
//     // defaults.memories.recentMessages(20),
//   ],
// }).def.pluginConfigs;

// .scope({
//   schema: z.object({
//     userId: z.string(),
//   }),
//   hasAccess: ({ request, scope }) => {
//     return request.headers.get("Authorization") === scope.userId;
//   },
// })
// .test({
//   items: ["item1", "item3"] as const,
// })
// .memories({
//   items: [],
// })
// .stores({
//   items: [],
// })
// .generation({
//   collections: ["collection1", "collection2"],
//   tools: [
//     {
//       name: "get-weather",
//       description: "Get the weather for a given location",
//       schema: {
//         input: z.object({
//           location: z.string(),
//         }),
//         output: z.object({
//           weather: z.string(),
//         }),
//       },
//       run: async ({ location }) => {
//         await new Promise((resolve) => setTimeout(resolve, 1000));
//         return {
//           success: true,
//           output: {
//             summary: `It's raining in ${location}.`,
//           },
//         };
//       },
//     },
//   ],
// });
//
