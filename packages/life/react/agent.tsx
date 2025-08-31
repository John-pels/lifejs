import type clients from "life/exports/build-client";
import { createContext, type FC, type ReactNode, useContext, useMemo } from "react";
import type { GeneratedAgentClient } from "@/agent/client/types";
import { createAgentClient } from "@/exports/client";

interface AgentContextValue {
  client: ReturnType<typeof createAgentClient>;
  name: keyof typeof clients;
  id?: string;
}

const AgentContext = createContext<AgentContextValue | null>(null);
const AgentContextRegistry = new Map<string, React.Context<AgentContextValue | null>>();

interface AgentProviderProps {
  name: keyof typeof clients;
  children: ReactNode;
  id?: string;
}

export const AgentProvider: FC<AgentProviderProps> = ({ name, children, id }) => {
  const client = useMemo(() => createAgentClient(name, { id }), [name, id]);
  const contextValue = useMemo(() => ({ client, name, id }), [client, name, id]);
  const Context = useMemo(() => {
    if (id) {
      const contextKey = `${String(name)}:${id}`;
      let context = AgentContextRegistry.get(contextKey);
      if (!context) {
        context = createContext<AgentContextValue | null>(null);
        AgentContextRegistry.set(contextKey, context);
      }
      return context;
    }
    return AgentContext;
  }, [name, id]);
  return <Context.Provider value={contextValue}>{children}</Context.Provider>;
};

interface UseAgentOptions {
  id?: string;
}

export function useAgent<K extends keyof typeof clients>(
  name: K,
  options?: UseAgentOptions,
): GeneratedAgentClient<K> {
  const contextKey = options?.id ? `${String(name)}:${options.id}` : null;
  const SpecificContext = contextKey ? AgentContextRegistry.get(contextKey) : null;

  const specificContextValue = useContext(SpecificContext || AgentContext);
  const defaultContextValue = useContext(AgentContext);

  const contextValue = options?.id ? specificContextValue : defaultContextValue;

  if (!contextValue) {
    if (options?.id) {
      throw new Error(`No AgentProvider found for agent "${String(name)}" with id "${options.id}"`);
    }
    throw new Error(
      `useAgent must be used within an AgentProvider. No provider found for agent "${String(name)}".`,
    );
  }

  if (contextValue.name !== name) {
    throw new Error(
      `Agent name mismatch: expected "${String(name)}", got "${String(contextValue.name)}"`,
    );
  }

  return contextValue.client as GeneratedAgentClient<K>;
}
