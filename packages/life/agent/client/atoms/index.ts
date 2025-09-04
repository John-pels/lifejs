import { atom, onMount, type WritableAtom } from "nanostores";
import type { LifeServer } from "@/server";
import type { AgentClient } from "../class";
import type { AgentClientDefinition } from "../types";

export interface InfoAtomConfig {
  pollingMs?: number;
}

export type AgentInfoResponse = Awaited<ReturnType<LifeServer["getAgentProcessInfo"]>> | { success: false; message: string; error: unknown };

export interface AgentClientAtoms {
  info: (config?: InfoAtomConfig) => WritableAtom<AgentInfoResponse | null> & { 
    refetch: () => Promise<void> 
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
            const data = await client.info();
            store.set(data);
          } catch (error) {
            console.error("Failed to fetch agent info:", error);
            store.set({
              success: false,
              message: error instanceof Error ? error.message : "Unknown error",
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