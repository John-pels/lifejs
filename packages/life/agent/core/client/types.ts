import type z from "zod";
import type { ContextAccessor, EventsAccessor } from "@/agent/runtime/types";
import type { TransportClient } from "@/transport/types";

export interface AgentClient {
  transport: TransportClient;
  config: z.output<typeof clientConfigSchema>;
  runtime: {
    events: EventsAccessor;
    context: ContextAccessor<"read">;
  };
  start(): Promise<void>;
  stop(): Promise<void>;
  continue(): void;
  /**
   * @param hint - Optional hint to help the agent decide.
   *
   * @example
   * agent.decide("The user just completed the form, check if you have some follow-up questions for them.");
   * ```
   */
  decide(hint?: string): Promise<void>;
  interrupt(): Promise<void>;
  say(): Promise<void>;
  status(): Promise<AgentStatus>;
  messages: {
    getById(id: string): Promise<Message | undefined>;
    getAll(): Promise<Message[]>;
    add(message: Message): Promise<string>;
    update(id: string, message: Message): Promise<string>;
    remove(id: string): Promise<string>;
  };
  actions: {
    actionName: {
      execute(): Promise<void>;
      lastRun: null;
      setOptions(): Promise<void>;
    };
  };
  memories: {
    memoryName: {
      get(): Promise<void>;
      setOptions(): Promise<void>;
    };
  };
  stores: {
    storeName: {
      get(): Promise<void>;
      set(): Promise<void>;
      setOptions(): Promise<void>;
    };
  };
}
