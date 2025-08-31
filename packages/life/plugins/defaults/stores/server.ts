// biome-ignore lint/performance/noNamespaceImport: yjs recommendation
import * as Y from "yjs";
import { z } from "zod";
import { definePlugin } from "../../server/define";
import { generationPlugin } from "../generation/server";
import type { StoreDefinition } from "./define";

// Helper: Convert plain JS values to Yjs structures recursively
function plainToYjs(value: unknown): unknown {
  if (Array.isArray(value)) {
    const yArray = new Y.Array();
    for (const item of value) yArray.push([plainToYjs(item)]);
    return yArray;
  }
  if (value && typeof value === "object" && value.constructor === Object) {
    const yMap = new Y.Map();
    for (const [k, v] of Object.entries(value)) yMap.set(k, plainToYjs(v));
    return yMap;
  }
  return value;
}

export const storesPlugin = definePlugin("stores")
  .dependencies([
    generationPlugin.pick({
      events: ["agent.continue"],
      context: ["messages"],
      config: ["voiceDetection"],
    }),
  ])
  .config(
    z.object({
      items: z.array(z.custom<{ _definition: StoreDefinition }>()).default([]),
    }),
  )
  .events({
    "update-store-data": {
      dataSchema: z.object({
        name: z.string(),
        data: z.any(),
      }),
    },
    "retrieve-store-data": {
      dataSchema: z.object({
        name: z.string(),
      }),
    },
  })
  .context(
    z.object({
      storesData: z.record(z.string(), z.any()).default({}),
    }),
  )
  .methods({
    test: {
      schema: z.function().args(z.void()).returns(z.string()),
      run: () => "test",
    },
  })
  .addService("crdt-manager", async ({ queue, events, config }) => {
    const docs = new Map<string, { doc: Y.Doc; isArray: boolean }>();
    // Initialize CRDT stores from config
    for (const item of config.items) {
      const store = item._definition;
      if (store.config.type === "freeform") {
        const doc = new Y.Doc();
        const isArray = store.config.schema instanceof z.ZodArray;
        docs.set(store.name, { doc, isArray });

        // Observe changes and emit updates
        doc.on("update", () => {
          const data = isArray ? doc.getArray("root").toJSON() : doc.getMap("root").toJSON();
          events.emit({ type: "update-store-data", data: { name: store.name, data } });
        });
      }
    }

    // Handle store updates
    for await (const event of queue) {
      if (event.type === "update-store-data") {
        const storeInfo = docs.get(event.data.name);
        if (!storeInfo) continue;

        storeInfo.doc.transact(() => {
          if (storeInfo.isArray) {
            const rootArray = storeInfo.doc.getArray("root");
            // Replace array contents with properly converted items
            rootArray.delete(0, rootArray.length);
            for (const item of event.data.data) {
              rootArray.push([plainToYjs(item)]);
            }
          } else {
            const rootMap = storeInfo.doc.getMap("root");
            // Merge object updates with proper conversion
            for (const [key, value] of Object.entries(event.data.data)) {
              rootMap.set(key, plainToYjs(value));
            }
          }
        });
      }
    }
  })
  .addEffect("sync-store-context", ({ event, context }) => {
    if (event.type === "update-store-data") {
      context.set("storesData", (ctx) => ({
        ...ctx,
        storesData: { ...ctx.storesData, [event.data.name]: event.data.data },
      }));
    }
  });
