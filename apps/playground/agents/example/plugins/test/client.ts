import { definePluginClient } from "life/client";
import { atom } from "nanostores";
import z from "zod";
import type { testPlugin } from "./server";

export const testPluginClient = definePluginClient<typeof testPlugin>("test")
  // .dependencies([defaults.plugins.generation])
  .config({
    schema: z.object({
      connectors: z.array(z.string()).prefault([]),
    }),
  })
  .class(
    ({ plugin }) =>
      class {
        getConnector(name: (typeof plugin)["$types"]["clientConfig"]["connectors"][number]) {
          return name;
        }
        getItem(name: (typeof plugin)["$types"]["serverConfig"]["items"][number]) {
          return name;
        }
      },
  )
  .atoms(({ plugin }) => [
    {
      name: "item",
      create: (name: (typeof plugin)["$types"]["serverConfig"]["items"][number]) => ({
        store: atom(name),
        refresh: async () => void 0,
      }),
    },
  ]);
