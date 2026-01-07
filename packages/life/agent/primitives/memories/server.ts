import z from "zod";
import { canon } from "@/shared/canon";
import { EventEmitter } from "@/shared/event-emitter";
import { type Message, messageSchema, prepareMessageInput } from "@/shared/messages";
import * as op from "@/shared/operation";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { TransportClient } from "@/transport/types";
import type { PrimitiveAccessors } from "../types";
import { emitterDefinition } from "./emitter";
import { memoryPositionSchema } from "./schemas";
import type {
  MemoryAccessor,
  MemoryDefinition,
  MemoryMessagesOutput,
  MemoryPosition,
} from "./types";

export class MemoryServer extends EventEmitter<typeof emitterDefinition> {
  readonly #transport: TransportClient;
  readonly #telemetry: TelemetryClient;
  readonly #definition: MemoryDefinition;
  readonly #dependencies: PrimitiveAccessors<MemoryDefinition["dependencies"]>;

  #position: MemoryPosition;
  #enabled = true;

  // Messages snapshot to track messages changes
  #messages: Message[] = [];

  constructor(params: {
    transport: TransportClient;
    telemetry: TelemetryClient;
    definition: MemoryDefinition;
    dependencies: PrimitiveAccessors<MemoryDefinition["dependencies"]>;
  }) {
    super(emitterDefinition, {
      transport: params.transport,
      prefix: `memories.${params.definition.name}`,
    });
    this.#transport = params.transport;
    this.#telemetry = params.telemetry;
    this.#definition = params.definition;
    this.#dependencies = params.dependencies;
    this.#position = params.definition.position;
    this.#initRPC();
  }

  /**
   * Compute the messages from the definition.
   * The definition can be either a static array or a function that computes messages dynamically.
   */
  async compute(history: Message[]) {
    return await this.#telemetry.trace("memory.compute()", async () => {
      if (!this.#enabled) return op.success();

      // Get the raw messages output from the definition
      const messagesDefinition = this.#definition.messages;
      let rawOutput: MemoryMessagesOutput;

      // If the definition is a function
      if (typeof messagesDefinition === "function")
        rawOutput = await messagesDefinition({
          history,
          ...this.#dependencies,
        });
      // Or a message array directly
      else rawOutput = messagesDefinition;

      // Normalize output to Message[]
      const messages = this.#normalizeMessages(rawOutput);

      // Emit change event if messages changed
      const [err, isEqual] = canon.equal(this.#messages, messages);
      if (err) return op.failure(err);
      if (!isEqual) this.emit({ name: "messagesChange", data: { messages } });
      this.#messages = messages;

      return op.success(messages);
    });
  }

  /**
   * Get the accessor for client-side usage.
   */
  getAccessor(): MemoryAccessor {
    return {
      messages: async () => await this.#messages,
      position: async () => await this.#position,
      setPosition: (position) => this.#setPosition(position),
      enabled: async () => await this.#enabled,
      setEnabled: (enabled) => this.#setEnabled(enabled),
      on: this.on,
      once: this.once,
    };
  }

  async #setPosition(position: MemoryPosition): Promise<void> {
    const [err, isEqual] = canon.equal(this.#position, position);
    if (err) throw err;
    this.#position = position;
    if (!isEqual) this.emit({ name: "positionChange", data: { position } });
    await void 0;
  }

  async #setEnabled(enabled: boolean): Promise<void> {
    const [err, isEqual] = canon.equal(this.#enabled, enabled);
    if (err) throw err;
    this.#enabled = enabled;
    if (!isEqual) this.emit({ name: "enabledChange", data: { enabled } });
    await void 0;
  }

  /**
   * Normalize various message output formats to Message[].
   */
  #normalizeMessages(output: MemoryMessagesOutput): Message[] {
    if (!output) return [];

    const messages: Message[] = [];
    for (const item of output) {
      // If it's already a valid Message, use it directly
      const parseResult = messageSchema.safeParse(item);
      if (parseResult.success) messages.push(parseResult.data);
      // Otherwise, treat it as CreateMessageInput and prepare it
      else {
        const [err, prepared] = prepareMessageInput(item);
        if (!err && prepared) messages.push(prepared);
      }
    }

    return messages;
  }

  #initRPC() {
    const prefix = `memories.${this.#definition.name}`;

    this.#transport.register({
      name: `${prefix}.messages`,
      schema: { output: z.object({ value: z.array(messageSchema) }) },
      execute: () => op.success({ value: this.#messages }),
    });

    this.#transport.register({
      name: `${prefix}.position`,
      schema: { output: z.object({ value: memoryPositionSchema }) },
      execute: () => op.success({ value: this.#position }),
    });

    this.#transport.register({
      name: `${prefix}.setPosition`,
      schema: { input: z.object({ position: memoryPositionSchema }) },
      execute: ({ position }) => op.attempt(async () => this.#setPosition(position)),
    });

    this.#transport.register({
      name: `${prefix}.enabled`,
      schema: { output: z.object({ value: z.boolean() }) },
      execute: () => op.success({ value: this.#enabled }),
    });

    this.#transport.register({
      name: `${prefix}.setEnabled`,
      schema: { input: z.object({ enabled: z.boolean() }) },
      execute: ({ enabled }) => op.attempt(async () => this.#setEnabled(enabled)),
    });
  }
}
