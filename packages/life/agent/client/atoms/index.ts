import { atom, onMount, type WritableAtom } from "nanostores";
import type z from "zod";
import type { definition } from "@/server/api/definition";
import { type LifeErrorUnion, lifeError } from "@/shared/error";
import type { AgentClient } from "../class";
import type { AgentClientDefinition } from "../types";

export interface InfoAtomConfig {
  pollingMs?: number;
}

export type AgentInfoResponse =
  | { success: true; data: z.infer<(typeof definition)["agent.info"]["outputDataSchema"]> }
  | { success: false; error: LifeErrorUnion };

export interface AgentClientAtoms {
  info: (config?: InfoAtomConfig) => WritableAtom<AgentInfoResponse | null> & {
    refetch: () => Promise<void>;
  };
}

export function createAgentClientAtoms(
  client: AgentClient<AgentClientDefinition>,
): AgentClientAtoms {
  const atomsCache = new Map<string, WritableAtom<unknown>>();

  return {
    info: (config?: InfoAtomConfig) => {
      const pollingMs = config?.pollingMs ?? 5000;
      const cacheKey = `info-${pollingMs}`;

      if (!atomsCache.has(cacheKey)) {
        const store = atom<AgentInfoResponse | null>(null);

        const refetch = async () => {
          try {
            const [error, data] = await client.info();
            if (error) return store.set({ success: false, error });
            store.set({ success: true, data });
          } catch (error) {
            store.set({
              success: false,
              error: lifeError({ code: "Unknown", cause: error }),
            });
          }
        };

        onMount(store, () => {
          // Fetch immediately on mount
          refetch();

          // Set up polling interval
          const intervalId = setInterval(() => {
            refetch();
          }, pollingMs);

          // Cleanup on unmount
          return () => {
            clearInterval(intervalId);
          };
        });

        // Add refetch method to the store
        Object.assign(store, { refetch });
        atomsCache.set(cacheKey, store);
      }

      return atomsCache.get(cacheKey) as WritableAtom<AgentInfoResponse | null> & {
        refetch: () => Promise<void>;
      };
    },
  };
}
