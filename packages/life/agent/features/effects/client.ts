import z from "zod";
import type { AgentClient } from "@/agent/core/client/types";
import { EventEmitter } from "@/shared/event-emitter";
import { emitterDefinition } from "./emitter";

export class EffectClient extends EventEmitter<typeof emitterDefinition> {
  readonly #agent: AgentClient;
  readonly name: string;

  constructor(agent: AgentClient, name: string) {
    super(emitterDefinition, { transport: agent.transport, prefix: `effects.${name}` });
    this.name = name;
    this.#agent = agent;
  }

  async hasMounted() {
    const [error, data] = await this.#agent.transport.call({
      name: `effects.${this.name}.hasMounted`,
      schema: { output: z.object({ value: z.boolean() }) },
    });
    if (error) throw error;
    return data.value;
  }

  async hasUnmounted() {
    const [error, data] = await this.#agent.transport.call({
      name: `effect.${this.name}.info`,
      schema: { output: z.object({ value: z.boolean() }) },
    });
    if (error) throw error;
    return data.value;
  }

  async mountedInMs() {
    const [error, data] = await this.#agent.transport.call({
      name: `effect.${this.name}.info`,
      schema: { output: z.object({ value: z.number() }) },
    });
    if (error) throw error;
    return data.value;
  }

  async unmountedInMs() {
    const [error, data] = await this.#agent.transport.call({
      name: `effects.${this.name}.unmountedInMs`,
      schema: { output: z.object({ value: z.number() }) },
    });
    if (error) throw error;
    return data.value;
  }

  async mountError() {
    const [error, data] = await this.#agent.transport.call({
      name: `effects.${this.name}.mountError`,
      schema: { output: z.object({ value: z.unknown().optional() }) },
    });
    if (error) throw error;
    return data.value;
  }

  async unmountError() {
    const [error, data] = await this.#agent.transport.call({
      name: `effects.${this.name}.unmountError`,
      schema: { output: z.object({ value: z.unknown().optional() }) },
    });
    if (error) throw error;
    return data.value;
  }
}
