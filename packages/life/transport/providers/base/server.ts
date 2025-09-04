import type { z } from "zod";

export type ServerTransportEvent = {
  type: "audio-chunk";
  chunk: Int16Array;
};

export abstract class BaseServerTransportProvider<ConfigSchema extends z.AnyZodObject> {
  config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  abstract on<EventType extends ServerTransportEvent["type"]>(
    type: EventType,
    callback: (event: Extract<ServerTransportEvent, { type: EventType }>) => void,
  ): void;
  abstract joinRoom(roomName: string, token: string): Promise<void>;
  abstract leaveRoom(): Promise<void>;
  abstract streamText(
    topic: string,
  ): Promise<
    Omit<
      WritableStreamDefaultWriter<string>,
      "desiredSize" | "closed" | "ready" | "abort" | "releaseLock"
    >
  >;
  abstract receiveStreamText(
    topic: string,
    callback: (iterator: AsyncIterable<string>, participantId: string) => void | Promise<void>,
  ): void;
  abstract streamAudioChunk(chunk: Int16Array): Promise<void>;
}
