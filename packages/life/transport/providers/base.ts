import type { z } from "zod";
import type { LifeError } from "@/shared/error";
import * as op from "@/shared/operation";

export interface TransportEvent {
  type: "audio-chunk";
  chunk: Int16Array;
}

export abstract class TransportProviderClientBase<ConfigSchema extends z.ZodObject> {
  config: z.infer<ConfigSchema>;
  listeners: Partial<Record<TransportEvent["type"], ((event: TransportEvent) => void)[]>> = {};

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  on<EventType extends TransportEvent["type"]>(
    type: EventType,
    callback: (data: Extract<TransportEvent, { type: EventType }>) => void,
  ) {
    try {
      if (!this.listeners[type]) this.listeners[type] = [];
      this.listeners[type].push(callback as (event: TransportEvent) => void);
      return op.success(() => {
        this.listeners[type] = this.listeners[type]?.filter((listener) => listener !== callback);
      });
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  abstract joinRoom(roomName: string, token: string): Promise<op.OperationResult<void>>;
  abstract leaveRoom(): Promise<op.OperationResult<void>>;
  abstract streamText(
    topic: string,
  ): Promise<
    op.OperationResult<
      Omit<
        WritableStreamDefaultWriter<string>,
        "desiredSize" | "closed" | "ready" | "abort" | "releaseLock"
      >
    >
  >;
  abstract receiveStreamText(
    topic: string,
    callback: (iterator: AsyncIterable<string>, participantId: string) => void | Promise<void>,
    onError?: (error: LifeError) => void,
  ): op.OperationResult<() => void>;
  abstract enableMicrophone(): Promise<op.OperationResult<void>>;
  abstract playAudio(): Promise<op.OperationResult<void>>;
  abstract streamAudioChunk(chunk: Int16Array): Promise<op.OperationResult<void>>;
}
