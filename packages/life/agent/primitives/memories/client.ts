import z from "zod";
import { EventEmitter } from "@/shared/event-emitter";
import { type Message, messageSchema } from "@/shared/messages";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { TransportClient } from "@/transport/types";
import { emitterDefinition } from "./emitter";
import { memoryPositionSchema } from "./schemas";
import type { MemoryAccessor, MemoryPosition } from "./types";

export class MemoryClient extends EventEmitter<typeof emitterDefinition> implements MemoryAccessor {
  readonly #transport: TransportClient;
  readonly #telemetry: TelemetryClient;
  readonly name: string;

  constructor(params: { transport: TransportClient; telemetry: TelemetryClient; name: string }) {
    super(emitterDefinition, { transport: params.transport, prefix: `memories.${params.name}` });
    this.#transport = params.transport;
    this.#telemetry = params.telemetry;
    this.name = params.name;
    this.setRemoteEvents(["messagesChange", "positionChange", "enabledChange"]);
  }

  async messages(): Promise<Message[]> {
    const [error, data] = await this.#transport.call({
      name: `memories.${this.name}.messages`,
      schema: { output: z.object({ value: z.array(messageSchema) }) },
    });
    if (error) throw error;
    return data.value;
  }

  async position(): Promise<MemoryPosition> {
    const [error, data] = await this.#transport.call({
      name: `memories.${this.name}.position`,
      schema: { output: z.object({ value: memoryPositionSchema }) },
    });
    if (error) throw error;
    return data.value;
  }

  async setPosition(position: MemoryPosition): Promise<void> {
    const [error] = await this.#transport.call({
      name: `memories.${this.name}.setPosition`,
      schema: { input: z.object({ position: memoryPositionSchema }) },
      input: { position },
    });
    if (error) throw error;
  }

  async enabled(): Promise<boolean> {
    const [error, data] = await this.#transport.call({
      name: `memories.${this.name}.enabled`,
      schema: { output: z.object({ value: z.boolean() }) },
    });
    if (error) throw error;
    return data.value;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    const [error] = await this.#transport.call({
      name: `memories.${this.name}.setEnabled`,
      schema: { input: z.object({ enabled: z.boolean() }) },
      input: { enabled },
    });
    if (error) throw error;
  }
}
