import type { z } from "zod";

export type ClientTransportEvent = never;
//
//
//

export abstract class BaseClientTransportProvider<ConfigSchema extends z.AnyZodObject> {
  config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  abstract on<EventType extends ClientTransportEvent["type"]>(
    type: EventType,
    callback: (event: Extract<ClientTransportEvent, { type: EventType }>) => void,
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
  abstract enableMicrophone(): Promise<void>;
  abstract playAudio(): Promise<void>;
}
