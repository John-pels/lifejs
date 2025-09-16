"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { LifeClient } from "@/client/client";
import type * as op from "@/shared/operation";

type PublicLifeClient = op.ToPublic<LifeClient>;

const LifeContext = createContext<PublicLifeClient | undefined>(undefined);

interface LifeProviderProps {
  client: PublicLifeClient;
  children: ReactNode;
}

export function LifeProvider({ client, children }: LifeProviderProps) {
  return <LifeContext.Provider value={client}>{children}</LifeContext.Provider>;
}

export function useLifeClient(): PublicLifeClient {
  const context = useContext(LifeContext);
  if (!context) throw new Error("useLifeClient() must be used within a <LifeProvider/>");
  return context;
}
