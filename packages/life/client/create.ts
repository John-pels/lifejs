import * as op from "@/shared/operation";
import { LifeClient } from "./client";
import type { LifeClientOptions } from "./types";

// Cache to store client instances by their options cache key
const clientCache = new Map<string, op.ToPublic<LifeClient>>();

const getCacheKey = (options: LifeClientOptions): string => {
  return `${options.serverUrl}::${options.serverToken ?? ""}`;
};

export const createLifeClient = (options: LifeClientOptions): op.ToPublic<LifeClient> | null => {
  // On the server, simply return the options
  if (typeof window === "undefined") return { options } as op.ToPublic<LifeClient>;

  // Generate cache key for these options
  const cacheKey = getCacheKey(options);

  // Return any cached client for these options
  const cachedClient = clientCache.get(cacheKey);
  if (cachedClient) return cachedClient;

  // Create a new client and cache it
  const newClient = op.toPublic(new LifeClient(options));
  clientCache.set(cacheKey, newClient);

  return newClient;
};
