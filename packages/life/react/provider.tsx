"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { LifeClient } from "@/client/client";
import { createLifeClient } from "@/client/create";
import type * as op from "@/shared/operation";

type PublicLifeClient = op.ToPublic<LifeClient>;

const LifeContext = createContext<PublicLifeClient | null>(null);

interface LifeProviderProps {
  client: op.ToPublic<LifeClient>;
  children: ReactNode;
}

export function LifeProvider({ client, children }: LifeProviderProps) {
  // Get or create a new client instance (bypass SSR cache)
  const instance = useMemo(
    () => createLifeClient(client.options),
    [client.options?.serverUrl, client.options?.serverToken],
  );
  return <LifeContext.Provider value={instance}>{children}</LifeContext.Provider>;
}

export function useLifeClient(): PublicLifeClient {
  const context = useContext(LifeContext);
  if (!context) throw new Error("useLifeClient() must be used within a <LifeProvider/>");
  return context;
}
