// @ts-nocheck
import "dotenv/config";
import { defaults, defineAgent, defineMemory, defineStore } from "life/define";
import z from "zod";

// Example of controlled store
const newsStore = defineStore("news")
  .config({
    type: "controlled",
    schema: z.array(z.object({ title: z.string(), content: z.string() })),
    ttl: 1000 * 60,
  })
  .retrieve(() => {
    return [
      {
        title: "Hello, world!",
        content: "This is a test",
      },
    ];
  });

// Example of freeform store
const formStore = defineStore("form").config({
  type: "freeform",
  schema: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
  }),
  initialValue: {
    firstName: "",
    lastName: "",
  },
}); /*
Then if a store is registered as dependency in a memory for example:
- For freeform stores
stores.myStore.get()
stores.myStore.set()
stores.myStore.onChange(selector, handler)

- For controlled stores
stores.myStore.get()
stores.myStore.refetch()
stores.myStore.onChange(selector, handler)
*/

const newsMemory = defineMemory("news")
  .dependencies({
    stores: [newsStore],
    plugins: [defaults.plugins.core.pick({ methods: ["createMessage"] })], // recommended if the item is going to be shared with the community (reduced the dependency surface, so is more likely compatible with custom plugins), else defaults.plugins.core is enough
  })
  .config({ behavior: "blocking" })
  // Recompute the news when the history changes
  .onHistoryChange(async ({ messages }) => {
    await newsStore.pretech({ cacheId: new History(messages).getHash() });
  })
  .output(async ({ messages, stores }) => {
    // Get the news from the store
    const news = await stores.get({ cacheId: new History(messages).getHash() }); // Blocking refetch (optional)
    // const news = stores.news.get();
    const history = new History([]);
    history.core.createMessage({
      role: "system",
      content: `
      ## Recent news
      Here are some recent news that might be relevant to the conversation:
      ${news.map((n) => `- ${n.title}: ${n.content}`).join("\n")}
      `.trim(),
    });
  });
// .onChange(({ agent, plugins, delta }) => {
//   plugins.core.createMessage(`News have changed: ${delta.toString()}`); // QUESTION HERE, should we depend on core or agent?
// });

export default defineAgent("demo")
  .config({
    transport: {
      provider: "livekit",
    },
  })
  .plugins([defaults.plugins])
  .memories({
    items: [
      defaults.memories.instructions(),
      newsMemory,
      defineMemory("recent-messages")
        .config({ behavior: "blocking" })
        .output(({ messages }) => messages.slice(-10)),
      defaults.memories.actions(),
      defaults.memories.percepts(),
    ],
  })
  .actions({
    items: [],
  })
  .stores({
    items: [defaults.stores, newsStore, formStore],
  })
  .collections({
    items: [defaults.collections],
  });
// .percepts({
//   items: [],
// })
// .widget({
//   items: [],
// });
