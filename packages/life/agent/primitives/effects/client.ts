import z from "zod";
import type { LifeError } from "@/shared/error";
import { EventEmitter } from "@/shared/event-emitter";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { TransportClient } from "@/transport/types";
import { emitterDefinition } from "./emitter";
import type { EffectAccessor } from "./types";

export class EffectClient extends EventEmitter<typeof emitterDefinition> implements EffectAccessor {
  readonly #transport: TransportClient;
  readonly #telemetry: TelemetryClient;
  readonly name: string;

  constructor(params: { transport: TransportClient; telemetry: TelemetryClient; name: string }) {
    super(emitterDefinition, { transport: params.transport, prefix: `effects.${params.name}` });
    this.#transport = params.transport;
    this.#telemetry = params.telemetry;
    this.name = params.name;
    this.setRemoteEvents(["mounted", "unmounted", "mountError", "unmountError"]);
  }

  async hasMounted() {
    const [error, data] = await this.#transport.call({
      name: `effects.${this.name}.hasMounted`,
      schema: { output: z.object({ value: z.boolean() }) },
    });
    if (error) throw error;
    return data.value;
  }

  async hasUnmounted() {
    const [error, data] = await this.#transport.call({
      name: `effect.${this.name}.info`,
      schema: { output: z.object({ value: z.boolean() }) },
    });
    if (error) throw error;
    return data.value;
  }

  async mountedInMs() {
    const [error, data] = await this.#transport.call({
      name: `effect.${this.name}.info`,
      schema: { output: z.object({ value: z.number() }) },
    });
    if (error) throw error;
    return data.value;
  }

  async unmountedInMs() {
    const [error, data] = await this.#transport.call({
      name: `effects.${this.name}.unmountedInMs`,
      schema: { output: z.object({ value: z.number() }) },
    });
    if (error) throw error;
    return data.value;
  }

  async mountError() {
    const [error, data] = await this.#transport.call({
      name: `effects.${this.name}.mountError`,
      schema: { output: z.object({ value: z.custom<LifeError>().optional() }) },
    });
    if (error) throw error;
    return data.value;
  }

  async unmountError() {
    const [error, data] = await this.#transport.call({
      name: `effects.${this.name}.unmountError`,
      schema: { output: z.object({ value: z.custom<LifeError>().optional() }) },
    });
    if (error) throw error;
    return data.value;
  }
}
