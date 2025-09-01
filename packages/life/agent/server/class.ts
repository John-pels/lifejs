import type z from "zod";
import { isSameType } from "zod-compare";
import { type EOUProvider, eouProviders } from "@/models/eou";
import { type LLMProvider, llmProviders } from "@/models/llm";
import { type STTProvider, sttProviders } from "@/models/stt";
import { type TTSProvider, ttsProviders } from "@/models/tts";
import { type VADProvider, vadProviders } from "@/models/vad";
import { PluginServer } from "@/plugins/server/class";
import type { PluginDefinition } from "@/plugins/server/types";
import { newId } from "@/shared/prefixed-id";
import { TransportServer } from "@/transport/server";
import type { AgentDefinition, AgentScope } from "./types";

export class AgentServer {
  id = newId("agent");
  definition: AgentDefinition;
  transport: TransportServer;
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
  pluginsContexts: Record<string, z.output<PluginDefinition["context"]>>;
  isRestart: boolean;

  constructor({
    definition,
    scope,
    pluginsContexts,
    isRestart,
  }: {
    definition: AgentDefinition;
    scope?: AgentScope<AgentDefinition["scope"]>;
    pluginsContexts?: Record<string, z.output<PluginDefinition["context"]>>;
    isRestart?: boolean;
  }) {
    this.definition = definition;
    this.scope = scope ?? definition.scope.schema.parse({});
    this.pluginsContexts = pluginsContexts ?? {};
    this.isRestart = isRestart ?? false;

    // Initialize transport
    this.transport = new TransportServer(definition.config.transport);

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
    const pluginNames = Object.values(this.definition.plugins).map((plugin) => plugin.name);
    const duplicates = pluginNames.filter((name, index) => pluginNames.indexOf(name) !== index);
    if (duplicates.length > 0) {
      const uniqueDuplicates = [...new Set(duplicates)];
      throw new Error(
        `Two or more plugins are named "${uniqueDuplicates.join('", "')}". Plugin names must be unique. (agent: '${this.definition.name}')`,
      );
    }

    // Validate plugin dependencies
    for (const plugin of Object.values(this.definition.plugins)) {
      for (const [depName, depDef] of Object.entries(plugin.dependencies || {})) {
        // - Ensure the plugin is provided
        const depPlugin = Object.values(this.definition.plugins).find((p) => p.name === depName);
        if (!depPlugin) {
          throw new Error(
            `Plugin "${plugin.name}" depends on plugin "${depName}", but "${depName}" is not registered. (agent: '${this.definition.name}')`,
          );
        }

        // - Validate required events exist and have the correct signature
        for (const [eventType, expectedEventDef] of Object.entries(depDef.events || {})) {
          // Check that the event exists
          const actualEventDef = depPlugin.events?.[eventType];
          if (!actualEventDef) {
            throw new Error(
              `Plugin "${plugin.name}" depends on event "${eventType}" from plugin "${depName}", but this event does not exist. (agent: '${this.definition.name}')`,
            );
          }

          // Compare event data schemas if expected
          const expectedSchema = expectedEventDef.dataSchema;
          if (expectedSchema) {
            const actualSchema = actualEventDef.dataSchema;
            if (!actualSchema) {
              throw new Error(
                `Plugin "${plugin.name}" depends on event "${eventType}" from plugin "${depName}" with a data schema, but the event has no data schema. (agent: '${this.definition.name}')`,
              );
            }
            if (!isSameType(expectedSchema, actualSchema)) {
              throw new Error(
                `Plugin "${plugin.name}" depends on event "${eventType}" from plugin "${depName}" with incompatible data schema. (agent: '${this.definition.name}')`,
              );
            }
          }
        }
      }
    }
  }

  async start() {
    // - Create plugin servers
    for (const plugin of Object.values(this.definition.plugins)) {
      const config = plugin.config.parse(this.definition.pluginConfigs[plugin.name] ?? {});
      this.plugins[plugin.name] = new PluginServer(
        this,
        plugin,
        config,
        this.pluginsContexts?.[plugin.name] ?? {},
      );
    }

    // - Prepare all plugins (this sets up services, interceptors, etc.)
    // biome-ignore lint/style/noNonNullAssertion: defined above, so exists
    for (const plugin of Object.values(this.definition.plugins)) this.plugins[plugin.name]!.init();

    // Start all plugin servers
    await Promise.all(Object.values(this.plugins).map((p) => p.start()));
  }

  async stop() {
    console.log("Stopping agent...");

    // Stop all plugins
    await Promise.all(
      Object.entries(this.plugins).map(([pluginId, plugin]) => {
        return plugin.stop().catch((error) => {
          console.error(`Error stopping plugin ${pluginId}:`, error);
        });
      }),
    );

    // Disconnect transport
    try {
      await this.transport.leaveRoom();
      console.log("Transport disconnected");
    } catch (error) {
      console.error("Error disconnecting transport:", error);
    }

    console.log("Agent stopped");
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
