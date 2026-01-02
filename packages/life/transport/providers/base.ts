import type { z } from "zod";
import type { LifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import type { TransportEvent } from "../types";

export abstract class TransportProviderBase<ConfigSchema extends z.ZodObject> {
  protected readonly config: z.infer<ConfigSchema>;
  readonly #listeners: Partial<
    Record<TransportEvent["type"], ((event: TransportEvent) => void)[]>
  > = {};

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  on<EventType extends TransportEvent["type"]>(
    type: EventType,
    callback: (data: Extract<TransportEvent, { type: EventType }>) => void,
  ) {
    try {
      if (!this.#listeners[type]) this.#listeners[type] = [];
      this.#listeners[type].push(callback as (event: TransportEvent) => void);
      return op.success(() => {
        this.#listeners[type] = this.#listeners[type]?.filter((listener) => listener !== callback);
      });
    } catch (error) {
      return op.failure({ code: "Unknown", cause: error });
    }
  }

  protected emit<EventType extends TransportEvent["type"]>(
    event: Extract<TransportEvent, { type: EventType }>,
  ) {
    if (!this.#listeners[event.type]) return;
    this.#listeners[event.type]?.forEach((listener) => void listener(event));
  }

  abstract joinRoom(...args: unknown[]): Promise<op.OperationResult<void>>;

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
