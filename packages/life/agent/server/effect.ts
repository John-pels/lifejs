import type { MaybePromise } from "bun";
import * as op from "@/shared/operation";
import type { EffectDefinition } from "../types";
import type { AgentServer } from "./agent";

export class EffectServer {
  readonly #agent: AgentServer;
  readonly #definition: EffectDefinition;
  #unmount?: () => MaybePromise<void>;

  constructor(agent: AgentServer, definition: EffectDefinition) {
    this.#agent = agent;
    this.#definition = definition;
  }

  async mount() {
    return await this.#agent.telemetry.trace("effect.mount()", async () => {
      const unmount = await this.#definition.onMount({
        actions: this.#agent.actions,
        memories: this.#agent.memories,
        stores: this.#agent.stores,
      });
      if (unmount) this.#unmount = unmount;
      return op.success();
    });
  }

  async unmount() {
    return await this.#agent.telemetry.trace("effect.unmount()", async () => {
      if (this.#unmount) await this.#unmount();
      return op.success();
    });
  }
}
