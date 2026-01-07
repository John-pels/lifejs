import z from "zod";
import type { LifeError } from "@/shared/error";
import { EventEmitter } from "@/shared/event-emitter";
import * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { TransportClient } from "@/transport/types";
import type { PrimitiveAccessors } from "../types";
import { emitterDefinition } from "./emitter";
import type { EffectAccessor, EffectDefinition } from "./types";

export class EffectServer extends EventEmitter<typeof emitterDefinition> {
  readonly #transport: TransportClient;
  readonly #telemetry: TelemetryClient;
  readonly #definition: EffectDefinition;
  readonly #dependencies: PrimitiveAccessors<EffectDefinition["dependencies"]>;
  #unmount?: () => MaybePromise<void>;
  #hasMounted = false;
  #hasUnmounted = false;
  #mountedInMs = -1;
  #unmountedInMs = -1;
  #mountError?: LifeError;
  #unmountError?: LifeError;

  constructor(params: {
    transport: TransportClient;
    telemetry: TelemetryClient;
    definition: EffectDefinition;
    dependencies: PrimitiveAccessors<EffectDefinition["dependencies"]>;
  }) {
    super(emitterDefinition, {
      transport: params.transport,
      prefix: `effects.${params.definition.name}`,
    });
    this.#transport = params.transport;
    this.#telemetry = params.telemetry;
    this.#definition = params.definition;
    this.#dependencies = params.dependencies;
    this.#initRPC();
  }

  async mount() {
    const result = await this.#telemetry.trace("effect.mount()", async () => {
      if (this.#hasMounted)
        return op.failure({ code: "Conflict", message: "Effect already mounted." });
      const start = performance.now();
      const unmount = await this.#definition.setup({ ...this.#dependencies });
      if (unmount) this.#unmount = unmount;
      this.#hasMounted = true;
      this.#mountedInMs = performance.now() - start;
      this.emit({ name: "mounted", data: { inMs: this.#mountedInMs } });
      return op.success();
    });

    if (result[0]) {
      this.#mountError = result[0];
      this.emit({ name: "mountError", data: { error: this.#mountError } });
    }
    return result;
  }

  async unmount() {
    const result = await this.#telemetry.trace("effect.unmount()", async () => {
      if (!this.#hasMounted)
        return op.failure({ code: "Conflict", message: "Effect not mounted." });
      if (this.#hasUnmounted)
        return op.failure({ code: "Conflict", message: "Effect already unmounted." });
      const start = performance.now();
      if (this.#unmount) await this.#unmount();
      this.#hasUnmounted = true;
      this.#unmountedInMs = performance.now() - start;
      this.emit({ name: "unmounted", data: { inMs: this.#unmountedInMs } });
      return op.success();
    });

    if (result[0]) {
      this.#unmountError = result[0];
      this.emit({ name: "unmountError", data: { error: this.#unmountError } });
    }
    return result;
  }

  getAccessor(): EffectAccessor {
    return {
      name: this.#definition.name,
      hasMounted: async () => await this.#hasMounted,
      hasUnmounted: async () => await this.#hasUnmounted,
      mountedInMs: async () => await this.#mountedInMs,
      unmountedInMs: async () => await this.#unmountedInMs,
      mountError: async () => await this.#mountError,
      unmountError: async () => await this.#unmountError,
      on: this.on,
      once: this.once,
    };
  }

  #initRPC() {
    const prefix = `effects.${this.#definition.name}`;
    this.#transport.register({
      name: `${prefix}.hasMounted`,
      schema: { output: z.object({ value: z.boolean() }) },
      execute: () => op.success({ value: this.#hasMounted }),
    });
    this.#transport.register({
      name: `${prefix}.hasUnmounted`,
      schema: { output: z.object({ value: z.boolean() }) },
      execute: () => op.success({ value: this.#hasUnmounted }),
    });
    this.#transport.register({
      name: `${prefix}.mountedInMs`,
      schema: { output: z.object({ value: z.number() }) },
      execute: () => op.success({ value: this.#mountedInMs }),
    });
    this.#transport.register({
      name: `${prefix}.unmountedInMs`,
      schema: { output: z.object({ value: z.number() }) },
      execute: () => op.success({ value: this.#unmountedInMs }),
    });
    this.#transport.register({
      name: `${prefix}.mountError`,
      schema: { output: z.object({ value: z.custom<LifeError>().optional() }) },
      execute: () => op.success({ value: this.#mountError }),
    });
    this.#transport.register({
      name: `${prefix}.unmountError`,
      schema: { output: z.object({ value: z.custom<LifeError>().optional() }) },
      execute: () => op.success({ value: this.#unmountError }),
    });
  }
}
