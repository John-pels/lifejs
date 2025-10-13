import { hmr } from "@/shared/hmr";
import * as op from "@/shared/operation";
import { LifeClient } from "./client";
import type { LifeClientOptions } from "./types";

// Create an HMR-resistant cache map
type ClientCache = Map<string, op.ToPublic<LifeClient>>;
declare global {
  var __LIFE_CLIENT_CACHE__: ClientCache | undefined;
}
const getClientCache = (): ClientCache => {
  if (!globalThis.__LIFE_CLIENT_CACHE__) globalThis.__LIFE_CLIENT_CACHE__ = new Map();
  return globalThis.__LIFE_CLIENT_CACHE__;
};

// Helper to generate a cache key
const getCacheKey = (options: LifeClientOptions): string =>
  `${options.serverUrl}::${options.serverToken ?? ""}`;

/**
 * Creates a new Life.js client instance, which is the main entry point
 * to interact with your Life.js agents.
 *
 * @param options - Client options.
 * @returns LifeClient instance.
 */
export const createLifeClient = (options: LifeClientOptions): op.ToPublic<LifeClient> | null => {
  // On the server, simply return the options
  if (typeof window === "undefined") return { options } as op.ToPublic<LifeClient>;

  // Get HMR-resistant cache and generate cache key
  const cache = getClientCache();
  const key = getCacheKey(options);

  // Return any cached client for these options
  const client = cache.get(key);
  if (client) return client;

  // Create a new client and cache it
  const newClient = op.toPublic(new LifeClient(options));
  cache.set(key, newClient);

  return newClient;
};

// If nobody higher up accepts hot-reloading, bundlers may trigger a full page reload,
// which would wipe globalThis. Accepting here prevents this module from causing that.
hmr.accept?.();
