import { isSameType } from "zod-compare";
import { type EOUProvider, eouProviders } from "@/models/eou";
import { type LLMProvider, llmProviders } from "@/models/llm";
import { type STTProvider, sttProviders } from "@/models/stt";
import { type TTSProvider, ttsProviders } from "@/models/tts";
import { type VADProvider, vadProviders } from "@/models/vad";
import { PluginServer } from "@/plugins/server/class";
import type { PluginDefinition } from "@/plugins/server/types";
import type { SerializableValue } from "@/shared/canon";
import * as op from "@/shared/operation";
import type { TelemetryClient } from "@/telemetry/base";
import { createTelemetryClient } from "@/telemetry/node";
import { TransportNodeClient } from "@/transport/client/node";
import type { AgentDefinition, AgentScope } from "./types";

export class AgentServer {
  _definition: AgentDefinition;
  _isAgentServer = true;
  id: string;
  sha: string;
  transport: TransportNodeClient;
  storage = null;
  models: {
    vad: InstanceType<VADProvider>;
    stt: InstanceType<STTProvider>;
    eou: InstanceType<EOUProvider>;
    llm: InstanceType<LLMProvider>;
    tts: InstanceType<TTSProvider>;
  };
  plugins: Record<string, PluginServer<PluginDefinition>> = {};
  scope: AgentScope<AgentDefinition["scope"]>;
  isRestart: boolean;
  readonly #initialPluginsContexts: Record<string, SerializableValue>;
  telemetry: TelemetryClient;

  constructor({
    id,
    sha,
    definition,
    scope,
    pluginsContexts,
    isRestart,
  }: {
    id: string;
    sha: string;
    definition: AgentDefinition;
    scope?: AgentScope<AgentDefinition["scope"]>;
    isRestart?: boolean;
    pluginsContexts?: Record<string, SerializableValue>;
  }) {
    this._definition = definition;
    this.id = id;
    this.sha = sha;
    this.scope = scope ?? definition.scope.schema.parse({});
    this.isRestart = isRestart ?? false;
    this.#initialPluginsContexts = pluginsContexts ?? {};

    // Initialize telemetry
    this.telemetry = createTelemetryClient("agent.server", {
      agentId: id,
      agentSha: sha,
      agentName: definition.name,
      agentConfig: definition.config,
      transportProviderName: definition.config.transport.provider,
      llmProviderName: definition.config.models.llm.provider,
      sttProviderName: definition.config.models.stt.provider,
      eouProviderName: definition.config.models.eou.provider,
      ttsProviderName: definition.config.models.tts.provider,
      vadProviderName: definition.config.models.vad.provider,
    });

    // Initialize transport
    this.transport = new TransportNodeClient({
      config: definition.config.transport,
      filterPublic: true,
    });

    // Initialize storage
    // TODO

    // Initialize models
    const vadProvider = vadProviders[definition.config.models.vad.provider];
    const sttProvider = sttProviders[definition.config.models.stt.provider];
    const eouProvider = eouProviders[definition.config.models.eou.provider];
    const llmProvider = llmProviders[definition.config.models.llm.provider];
    const ttsProvider = ttsProviders[definition.config.models.tts.provider];
    this.models = {
      vad: new vadProvider.class(definition.config.models.vad),
      stt: new sttProvider.class(definition.config.models.stt),
      eou: new eouProvider.class(definition.config.models.eou as never),
      llm: new llmProvider.class(definition.config.models.llm as never),
      tts: new ttsProvider.class(definition.config.models.tts),
    };

    // Validate plugins
    this.#validatePlugins();
  }

  #validatePlugins() {
    // Validate plugins have unique names
    const pluginNames = Object.values(this._definition.plugins).map((plugin) => plugin.name);
    const duplicates = pluginNames.filter((name, index) => pluginNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      const uniqueDuplicates = [...new Set(duplicates)];
      throw new Error(
        `Two or more plugins are named "${uniqueDuplicates.join('", "')}". Plugin names must be unique. (agent: '${this._definition.name}')`,
      );
    }

    // Validate plugin dependencies
    for (const plugin of Object.values(this._definition.plugins)) {
      for (const [depName, depDef] of Object.entries(plugin.dependencies || {})) {
        // - Ensure the plugin is provided
        const depPlugin = Object.values(this._definition.plugins).find((p) => p.name === depName);
        if (!depPlugin) {
          throw new Error(
            `Plugin "${plugin.name}" depends on plugin "${depName}", but "${depName}" is not registered. (agent: '${this._definition.name}')`,
          );
        }

        // - Validate required events exist and have the correct signature
        for (const [eventType, expectedEventDef] of Object.entries(depDef.events || {})) {
          // Check that the event exists
          const actualEventDef = depPlugin.events?.[eventType];
          if (!actualEventDef) {
            throw new Error(
              `Plugin "${plugin.name}" depends on event "${eventType}" from plugin "${depName}", but this event does not exist. (agent: '${this._definition.name}')`,
            );
          }

          // Compare event data schemas if expected
          const expectedSchema = expectedEventDef.dataSchema;
          if (expectedSchema) {
            const actualSchema = actualEventDef.dataSchema;
            if (!actualSchema) {
              throw new Error(
                `Plugin "${plugin.name}" depends on event "${eventType}" from plugin "${depName}" with a data schema, but the event has no data schema. (agent: '${this._definition.name}')`,
              );
            }
            if (!isSameType(expectedSchema, actualSchema)) {
              throw new Error(
                `Plugin "${plugin.name}" depends on event "${eventType}" from plugin "${depName}" with incompatible data schema. (agent: '${this._definition.name}')`,
              );
            }
          }
        }
      }
    }
  }

  async start() {
    using _ = (await this.telemetry.trace("AgentServer.start()")).start();

    try {
      // Create plugin servers
      for (const definition of Object.values(this._definition.plugins)) {
        const config = definition.config.schema.parse(
          this._definition.pluginConfigs[definition.name] ?? {},
        );
        this.plugins[definition.name] = new PluginServer({
          agent: this,
          definition,
          config,
          context: this.#initialPluginsContexts?.[definition.name] ?? {},
        });
      }

      // Prepare all plugins (this sets up services, interceptors, etc.)
      for (const plugin of Object.values(this._definition.plugins))
        this.plugins[plugin.name as keyof typeof this.plugins]?.init();

      // Start all plugin servers
      const result = await Promise.all(Object.values(this.plugins).map((p) => p.start()));
      const err = result.find((r) => r[0])?.[0];
      if (err) return op.failure(err);

      // Return that the agent server was started successfully
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }

  async stop() {
    using h0 = (await this.telemetry.trace("AgentServer.stop()")).start();

    try {
      // Stop all plugins
      await Promise.all(
        Object.entries(this.plugins).map(([pluginId, plugin]) => {
          return plugin.stop().catch((error) => {
            h0.log.error({ message: `Error stopping plugin ${pluginId}:`, error });
          });
        }),
      );

      // Disconnect transport
      const [errLeave] = await this.transport.leaveRoom();
      if (errLeave) return op.failure(errLeave);

      // Return that the agent server was stopped successfully
      return op.success();
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }
}

// notify: (
//   { emit, context },
//   params: {
//     source: "user" | "application";
//     behavior: "inform" | "interrupt" | "decide";
//     message: string;
//   },
// ) => {
//   // Insert the notification message
//   const message = `${params.source === "user" ? "User" : "Application"} update: ${params.message}`;
//   emit({
//     type: "operation.message",
//     data: {
//       id: generateId(),
//       role: params.source === "user" ? "user" : "system",
//       message,
//     },
//   });

//   // If the behavior is "discrete", return
//   if (params.behavior === "inform") return;
//   // Else, if the behavior is interrupt, run continue
//   else if (params.behavior === "interrupt")
//     emit({
//       type: "operation.continue",
//       data: {
//         messages: context.messages,
//         insertPolicy: "abrupt-interrupt",
//         allowInterruption: true,
//       },
//     });
//   // Else, if the behavior is decide, decide whether to make the notification interrupt or not
//   else if (params.behavior === "decide") {
//     emit({
//       type: "operation.decide",
//       data: { messages: [], insertPolicy: "abrupt-interrupt", allowInterruption: true },
//     });
//   }
// },
// ask: ({ emit, context }, message: string) => {
//   emit({
//     type: "operation.message",
//     data: { id: generateId(), role: "user", message: message },
//   });
//   emit({ type: "operation.continue", data: { messages: context.messages } });
// },
// prompt: ({ emit, context }, message: string) => {
//   emit({
//     type: "operation.message",
//     data: { id: generateId(), role: "system", message: message },
//   });
//   emit({ type: "operation.continue", data: { messages: context.messages } });
// },
