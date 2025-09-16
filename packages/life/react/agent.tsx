import { useEffect, useState } from "react";
import type { GeneratedAgentClient } from "@/agent/client/types";
import type { ClientBuild } from "@/exports/build/client";
import { useLifeClient } from "./provider";

interface UseAgentOptions {
  id?: string;
}

export function useAgent<K extends keyof ClientBuild>(
  name: K,
  options?: UseAgentOptions,
): GeneratedAgentClient<K> | null {
  const client = useLifeClient();
  const [agent, setAgent] = useState<GeneratedAgentClient<K> | null>(null);

  const initAgent = async () => {
    setAgent((await client.getOrCreateAgent(name, options)) as GeneratedAgentClient<K>);
  };

  useEffect(() => {
    initAgent();
  }, [name, options]);

  return agent;
}
