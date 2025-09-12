import { z } from "zod";
import { definePlugin } from "@/plugins/server/define";
import { canon } from "@/shared/canon";
import { type Message, messageSchema } from "@/shared/resources";
import { generationPlugin } from "../generation/server";
import type { MemoryDefinition } from "./define";

// Helper function to build a memory and get its output messages
async function buildMemory(
  memory: { _definition: MemoryDefinition },
  messages: Message[],
): Promise<Message[]> {
  const { output } = memory._definition;
  if (typeof output === "function") return await output({ messages });
  return output ?? [];
}

export const memoriesPlugin = definePlugin("memories")
  .dependencies([generationPlugin])
  .config({
    schema: z.object({
      items: z.array(z.custom<{ _definition: MemoryDefinition }>()).default([]),
    }),
    toTelemetryAttribute: (config) => {
      // Rewrite items to only keep their configs
      config.items = config.items.map((item) => ({
        config: item._definition.config,
      })) as never;

      return config;
    },
  })
  .events({
    "history-changed": {
      dataSchema: z.array(messageSchema),
    },
    "build-request": {
      dataSchema: generationPlugin._definition.events["agent.resources-response"].dataSchema,
    },
    "build-response": {
      dataSchema: generationPlugin._definition.events["agent.resources-response"].dataSchema,
    },
    "cache-build": {
      dataSchema: z.object({
        messagesHash: z.string(),
        memories: z.array(messageSchema),
      }),
    },
    "cache-memory": {
      dataSchema: z.object({
        name: z.string(),
        messages: z.array(messageSchema),
        timestamp: z.number(),
      }),
    },
  })
  .context(
    z.object({
      memoriesLastResults: z.custom<Map<string, Message[]>>().default(new Map()),
      memoriesLastTimestamp: z.custom<Map<string, number>>().default(new Map()),
      processedRequestsIds: z.custom<Set<string>>().default(new Set<string>()),
      computedMemoriesCache: z
        .custom<Map<string, { hash: string; memories: Message[] }>>()
        .default(new Map()),
    }),
  )
  // Intercept the 'agent.resources-response' from generation plugin to emit blocking build-request
  .addInterceptor(
    "intercept-generation-resources-response",
    ({ event, drop, dependency, current }) => {
      if (dependency.name !== "generation" || event.type !== "agent.resources-response") return;

      // Ignore already processed requests
      if (current.context.get().processedRequestsIds.has(event.data.requestId)) return;

      // Drop the agent.resources-response event
      drop("Will be re-emitted by memories later.");

      // Emit a build-request event
      current.events.emit({ type: "build-request", data: event.data });
    },
  )

  // Intercept changes in generation messages to emit non-blocking build-request
  .addInterceptor("intercept-generation-messages-change", ({ event, dependency, current }) => {
    if (dependency.name !== "generation" || event.type !== "messages.changed") return;
    current.events.emit({ type: "history-changed", data: event.data });
  })

  // Build non-blocking memories when build-request is received
  .addService("build-non-blocking-memories", async ({ config, events, queue }) => {
    for await (const event of queue) {
      if (event.type !== "history-changed") continue;

      const timestamp = Date.now();

      // Update each non-blocking memory asynchronously
      for (const item of config.items) {
        const def = item._definition;
        if (def.config.behavior !== "non-blocking") continue;

        // Fire and forget - don't await
        buildMemory(item, event.data)
          .then((messages) => {
            events.emit({ type: "cache-memory", data: { name: def.name, messages, timestamp } });
          })
          .catch((error) => {
            console.error(`Failed to update non-blocking memory '${def.name}':`, error);
          });
      }
    }
  })
  // Build memories messages and emit build response
  .addService("build-memories", async ({ config, events, queue, context }) => {
    for await (const event of queue) {
      if (event.type !== "build-request") continue;

      // Compute hash of input messages to check cache
      const [errHash, messagesHash] = await canon.sha256({ messages: event.data.messages });
      if (errHash) {
        // TODO: Log error
        events.emit({ type: "build-response", data: { ...event.data, messages: [] } });
        continue;
      }

      // Check if we've already computed memories for these messages
      const cachedResult = context.get().computedMemoriesCache.get(messagesHash);
      if (cachedResult) {
        // Use cached result
        events.emit({
          type: "build-response",
          data: {
            ...event.data,
            messages: cachedResult.memories,
          },
        });
        continue;
      }

      // Process memories in the order they were defined
      const memoriesMessages: Message[] = [];

      const timestamp = Date.now();

      // Build all blocking memories concurrently
      const blockingResults = new Map<number, Message[]>();
      const blockingPromises = config.items.map(async (item, index) => {
        const def = item._definition;
        if (def.config.behavior !== "blocking") return;

        const messages = await buildMemory(item, event.data.messages);
        blockingResults.set(index, messages);
        events.emit({
          type: "cache-memory",
          data: { name: def.name, messages, timestamp },
        });
      });

      await Promise.all(blockingPromises);

      // Build final array in original order
      for (let i = 0; i < config.items.length; i++) {
        const item = config.items[i];
        if (!item) continue;

        const def = item._definition;
        if (def.config.behavior === "blocking") {
          const messages = blockingResults.get(i) ?? [];
          memoriesMessages.push(...messages);
        } else {
          const cached = context.get().memoriesLastResults.get(def.name) ?? [];
          memoriesMessages.push(...cached);
        }
      }

      // Emit cache update event
      events.emit({
        type: "cache-build",
        data: { messagesHash, memories: memoriesMessages },
      });

      // Re-emit the resources response with the memories messages
      events.emit({
        type: "build-response",
        data: {
          ...event.data,
          messages: memoriesMessages,
        },
      });
    }
  })
  // Store memory results in context (only if newer than existing)
  .addEffect("handle-memory-cache", ({ event, context }) => {
    if (event.type !== "cache-memory") return;
    const currentTimestamp = context.get().memoriesLastTimestamp.get(event.data.name) ?? 0;
    if (event.data.timestamp >= currentTimestamp) {
      context.set((ctx) => {
        const newMap = new Map(ctx.memoriesLastResults);
        newMap.set(event.data.name, event.data.messages);
        return { ...ctx, memoriesLastResults: newMap };
      });
      context.set((ctx) => {
        const newMap = new Map(ctx.memoriesLastTimestamp);
        newMap.set(event.data.name, event.data.timestamp);
        return { ...ctx, memoriesLastTimestamp: newMap };
      });
    }
  })
  // Update the computed memories cache
  .addEffect("handle-build-cache", ({ event, context }) => {
    if (event.type !== "cache-build") return;

    context.set((ctx) => {
      const newMap = new Map(ctx.computedMemoriesCache);
      newMap.set(event.data.messagesHash, {
        hash: event.data.messagesHash,
        memories: event.data.memories,
      });
      return { ...ctx, computedMemoriesCache: newMap };
    });
  })
  // Re-emit the build-response event
  .addEffect("re-emit-build-response", ({ event, dependencies, context }) => {
    if (event.type !== "build-response") return;
    // Add the request id to the processed requests ids
    context.set((ctx) => {
      const newSet = new Set(ctx.processedRequestsIds);
      newSet.add(event.data.requestId);
      return { ...ctx, processedRequestsIds: newSet };
    });
    // Re-emit the resources response event
    dependencies.generation.events.emit({
      type: "agent.resources-response",
      data: event.data,
    });
  });
