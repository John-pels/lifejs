import { eouProviders } from "@/models/eou";
import { LLMProvider } from "@/models/llm/provider";
import { sttProviders } from "@/models/stt";
import { ttsProviders } from "@/models/tts";
import { vadProviders } from "@/models/vad";
import { deepClone } from "@/shared/deep-clone";
import { lifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/node";
import { TransportNodeClient } from "@/transport/client/node";
import type { TransportClient } from "@/transport/types";
import { configSchema } from "../config/schema/server";
import { AgentRuntime } from "../runtime";
import { ActionServer } from "./action";
import { EffectServer } from "./effect";
import { MemoryServer } from "./memory";
import { StoreServer } from "./store";
import type { AgentDefinition, AgentModels, Config, Context } from "./types";

export class AgentServer {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly definition: AgentDefinition;
  readonly #config: Config;

  readonly runtime: AgentRuntime;
  readonly telemetry: TelemetryClient;
  readonly transport: TransportClient;
  readonly models: AgentModels;
  readonly storage = null;
  readonly actions: Record<string, ActionServer> = {};
  readonly memories: Record<string, MemoryServer> = {};
  readonly stores: Record<string, StoreServer> = {};
  readonly effects: Record<string, EffectServer> = {};

  constructor(params: {
    id: string;
    version: string;
    definition: AgentDefinition;
    isRestart: boolean;
    config?: Config;
    context?: Context;
  }) {
    this.id = params.id;
    this.name = params.definition.name;
    this.version = params.version;
    this.definition = params.definition;

    // Validate and set config
    const { error: errConfig, data: parsedConfig } = configSchema.safeParse(params.config ?? {});
    if (errConfig)
      throw lifeError({
        code: "Validation",
        message: "Invalid config provided.",
        cause: errConfig,
      });
    this.#config = parsedConfig;

    // Initialize telemetry
    this.telemetry = createTelemetryClient("server", {
      agentId: this.id,
      agentName: this.name,
      agentVersion: this.version,
    });

    // Initialize transport
    this.transport = new TransportNodeClient({
      config: this.#config.transport,
      obfuscateErrors: true,
      telemetry: this.telemetry,
    });

    // Initialize models
    this.models = {
      llm: new LLMProvider(this.#config.models.llm),
      eou: new eouProviders[this.#config.models.eou.provider](this.#config.models.eou as never),
      stt: new sttProviders[this.#config.models.stt.provider](this.#config.models.stt as never),
      tts: new ttsProviders[this.#config.models.tts.provider](this.#config.models.tts as never),
      vad: new vadProviders[this.#config.models.vad.provider](this.#config.models.vad as never),
    };

    // Initialize runtime
    this.runtime = new AgentRuntime({
      agent: this,
      context: params.context,
      isRestart: params.isRestart,
    });

    // Initialize items
    for (const definition of this.definition.actions)
      this.actions[definition.name] = new ActionServer(this, definition, transport);
    for (const definition of this.definition.memories)
      this.memories[definition.name] = new MemoryServer(this, definition, transport);
    for (const definition of this.definition.stores)
      this.stores[definition.name] = new StoreServer(this, definition, transport);
    for (const definition of this.definition.effects)
      this.effects[definition.name] = new EffectServer(this, definition, transport);

    // Expose client accessor via RPC
    this.#initClientRPC();
  }

  /**
   * Safe accessor over the agent config.
   * @returns A cloned version of the agent config.
   */
  getConfig() {
    const [errClone, clonedConfig] = op.attempt(() => deepClone(this.#config));
    if (errClone) return op.failure(errClone);
    return op.success(clonedConfig);
  }

  /**
   * Starts the agent.
   */
  async start() {
    return await this.telemetry.trace("agent.start()", async () => {
      // 1. Start the agent runtime
      const [errStart] = await this.runtime.start();
      if (errStart) return op.failure(errStart);

      // 2. Mount effects on agent start
      for (const effect of Object.values(this.effects)) {
        const [errMount] = await effect.mount();
        if (errMount) return op.failure(errMount);
      }

      return op.success();
    });
  }

  /**
   * Stops the agent.
   */
  async stop() {
    return await this.telemetry.trace("agent.stop()", async () => {
      // 1. Stop the agent runtime
      const [errStop] = await this.runtime.stop();
      if (errStop) return op.failure(errStop);

      // 2. Unmount effects on agent stop
      for (const effect of Object.values(this.effects)) {
        const [errUnmount] = await effect.unmount();
        if (errUnmount) return op.failure(errUnmount);
      }

      return op.success();
    });
  }

  #initClientRPC() {
    return void 0;
  }
}
