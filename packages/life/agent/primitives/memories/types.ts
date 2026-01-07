import type z from "zod";
import type { EventEmitter } from "@/shared/event-emitter";
import type { CreateMessageInput, Message } from "@/shared/messages";
import type { MaybePromise } from "@/shared/types";
import type { PrimitiveAccessors, PrimitiveDefinitions } from "../types";
import type { emitterDefinition } from "./emitter";
import type { memoryPositionSchema } from "./schemas";

// Position
export type MemoryPosition = z.infer<typeof memoryPositionSchema>;

// Messages
export type MemoryMessagesOutput =
  | Message[]
  | readonly Message[]
  | CreateMessageInput[]
  | readonly CreateMessageInput[]
  | undefined
  | null;

export type MemoryMessages<Dependencies extends PrimitiveDefinitions = PrimitiveDefinitions> =
  | MemoryMessagesOutput
  | ((
      params: {
        history: Message[];
      } & PrimitiveAccessors<Dependencies>,
    ) => MaybePromise<MemoryMessagesOutput>);

// Definition
export interface MemoryDefinition {
  name: string;
  dependencies: PrimitiveDefinitions;
  messages: MemoryMessages;
  position: MemoryPosition;
}

// Accessor
export interface MemoryAccessor {
  messages: () => Promise<Message[]>;
  position: () => Promise<MemoryPosition>;
  setPosition: (position: MemoryPosition) => Promise<void>;
  enabled: () => Promise<boolean>;
  setEnabled: (enabled: boolean) => Promise<void>;
  on: EventEmitter<typeof emitterDefinition>["on"];
  once: EventEmitter<typeof emitterDefinition>["once"];
}
