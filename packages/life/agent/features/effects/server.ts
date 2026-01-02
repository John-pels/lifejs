import z from "zod";
import type { AgentServer } from "@/agent/core/server";
import type { LifeError } from "@/shared/error";
import { EventEmitter } from "@/shared/event-emitter";
import * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import { emitterDefinition } from "./emitter";
import type { EffectDefinition } from "./types";

export class EffectServer extends EventEmitter<typeof emitterDefinition> {
  readonly #agent: AgentServer;
  readonly #definition: EffectDefinition;
  #unmount?: () => MaybePromise<void>;
  #hasMounted = false;
  #hasUnmounted = false;
  #mountedInMs = -1;
  #unmountedInMs = -1;
  #mountError?: LifeError;
  #unmountError?: LifeError;

  constructor(agent: AgentServer, definition: EffectDefinition) {
    super(emitterDefinition, { transport: agent.transport, prefix: `effects.${definition.name}` });
    this.#agent = agent;
    this.#definition = definition;
    this.#initClientRPC();
  }

  async mount() {
    const result = await this.#agent.telemetry.trace("effect.mount()", async () => {
      if (this.#hasMounted)
        return op.failure({ code: "Conflict", message: "Effect already mounted." });
      const start = performance.now();
      const unmount = await this.#definition.onMount({
        actions: this.#agent.actions,
        memories: this.#agent.memories,
        stores: this.#agent.stores,
      });
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
    const result = await this.#agent.telemetry.trace("effect.unmount()", async () => {
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

  async hasMounted() {
    return await op.success({ value: this.#hasMounted });
  }

  async hasUnmounted() {
    return await op.success({ value: this.#hasUnmounted });
  }

  async mountedInMs() {
    return await op.success({ value: this.#mountedInMs });
  }

  async unmountedInMs() {
    return await op.success({ value: this.#unmountedInMs });
  }

  async mountError() {
    return await op.success({ value: this.#mountError });
  }

  async unmountError() {
    return await op.success({ value: this.#unmountError });
  }

  #initClientRPC() {
    this.#agent.transport.register({
      name: `effects.${this.#definition.name}.hasMounted`,
      schema: { output: z.object({ value: z.boolean() }) },
      execute: () => op.success({ value: this.#hasMounted }),
    });
    this.#agent.transport.register({
      name: `effects.${this.#definition.name}.hasUnmounted`,
      schema: { output: z.object({ value: z.boolean() }) },
      execute: () => op.success({ value: this.#hasUnmounted }),
    });
    this.#agent.transport.register({
      name: `effects.${this.#definition.name}.mountedInMs`,
      schema: { output: z.object({ value: z.number() }) },
      execute: () => op.success({ value: this.#mountedInMs }),
    });
    this.#agent.transport.register({
      name: `effects.${this.#definition.name}.unmountedInMs`,
      schema: { output: z.object({ value: z.number() }) },
      execute: () => op.success({ value: this.#unmountedInMs }),
    });
    this.#agent.transport.register({
      name: `effects.${this.#definition.name}.mountError`,
      schema: { output: z.object({ value: z.unknown().optional() }) },
      execute: () => op.success({ value: this.#mountError }),
    });
    this.#agent.transport.register({
      name: `effects.${this.#definition.name}.unmountError`,
      schema: { output: z.object({ value: z.unknown().optional() }) },
      execute: () => op.success({ value: this.#unmountError }),
    });
  }
}
