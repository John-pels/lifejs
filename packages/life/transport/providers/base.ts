import type { z } from "zod";
import type * as op from "@/shared/operation";

export type TransportEvent = {
  type: "audio-chunk";
  chunk: Int16Array;
};

export abstract class TransportProviderClientBase<ConfigSchema extends z.AnyZodObject> {
  config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  abstract on<EventType extends TransportEvent["type"]>(
    type: EventType,
    callback: (event: Extract<TransportEvent, { type: EventType }>) => void,
  ): op.OperationResult<() => void>;
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
  ): op.OperationResult<() => void>;
  abstract enableMicrophone(): Promise<op.OperationResult<void>>;
  abstract playAudio(): Promise<op.OperationResult<void>>;
  abstract streamAudioChunk(chunk: Int16Array): Promise<op.OperationResult<void>>;
}
