import { createBirpc } from "birpc";
import { AgentServer } from "@/agent/server/class";
import { prepareAgentConfig } from "@/agent/server/config";
import { importServerBuild } from "@/exports/build/server";
import type { AsyncQueue } from "@/shared/async-queue";
import { canon } from "@/shared/canon";
import { isLifeError, lifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import { ProcessStats } from "@/shared/process-stats";
import { createTelemetryClient, TelemetryNodeClient } from "@/telemetry/clients/node";
import { pipeConsoleToTelemetryClient } from "@/telemetry/helpers/patch-console";
import type { TelemetrySignal } from "@/telemetry/types";
import type { ChildMethods, ParentMethods } from "./types";

// Keep track of process stats
const processStats = new ProcessStats();

// Holds the agent server instance created in start()
let agentServer: AgentServer | null = null;

// Note: Attributes are going to be rewritten by the parent process anyway
const telemetry = createTelemetryClient("server", { watch: false });

// Forward console.* methods to the process telemetry client
pipeConsoleToTelemetryClient(telemetry);

const rpc = createBirpc<ParentMethods, ChildMethods>(
  {
    //
    async start(params) {
      try {
        // Retrieve the agent definition
        const [errIndex, buildIndex] = await importServerBuild({
          projectDirectory: process.cwd(),
          noCache: true,
        });
        if (errIndex) return op.failure(errIndex);
        const build = buildIndex?.[params.name as keyof typeof buildIndex];
        if (!build)
          return op.failure({ code: "NotFound", message: `Agent '${params.name}' not found.` });

        // Obtain the final agent config
        const [errConfig, config] = prepareAgentConfig(
          build.definition.config,
          build.globalConfigs,
        );
        if (errConfig) return op.failure(errConfig);

        // Create the agent server
        const [errCreate, instance] = op.attempt(
          () =>
            new AgentServer({
              id: params.id,
              definition: build.definition,
              scope: params.scope,
              sha: build.sha,
              config: config.server,
              pluginsContexts: params.pluginsContexts,
              isRestart: params.isRestart,
            }),
        );
        if (errCreate) return op.failure(errCreate);
        agentServer = instance;

        // Stream plugin context changes to parent
        for (const pluginName of Object.keys(build.definition.plugins)) {
          agentServer.plugins[pluginName]?.onContextChange(
            (c) => c,
            async (c) => {
              if (!agentServer) return;
              const [error] = await rpc.syncContext({
                agentId: agentServer.id,
                pluginName,
                context: c,
                timestamp: Date.now(),
              });
              if (error)
                telemetry.log.error({
                  message: `Failed to sync for plugin '${pluginName}' in agent '${agentServer.definition.name}' process.`,
                  error,
                });
            },
          );
        }

        // Start the agent server
        const [err] = await agentServer.start();
        if (err) return op.failure(err);

        // Register transport room
        await agentServer.transport.joinRoom(params.transportRoom.name, params.transportRoom.token);

        // Notify parent that agent is ready
        await rpc.ready();

        // Return that the agent server was started successfully
        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    },

    async stop() {
      try {
        if (agentServer) {
          const [err] = await agentServer.stop();
          if (err) return op.failure(err);
          agentServer = null;
        }
        return op.success();
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    },

    // Simple ping to check if process is responsive
    async ping() {
      return await op.success();
    },

    // Get detailed stats from the child process
    async getProcessStats() {
      try {
        return await op.success(processStats.get());
      } catch (error) {
        return op.failure({ code: "Unknown", cause: error });
      }
    },
  },
  {
    post: (data) => process.send?.(data),
    on: (fn) => process.on("message", fn),
    serialize: (data) => {
      const [error, result] = canon.serialize(data);
      if (error) {
        throw lifeError({
          code: "Validation",
          message:
            "Failed to serialize data from agent process to server. The message has been discarded.",
          attributes: { agentId: agentServer?.id, agentName: agentServer?.definition.name, data },
          cause: error,
        });
      }
      return result;
    },
    deserialize: (data) => {
      const [error, result] = canon.deserialize(data);
      if (error) {
        throw lifeError({
          code: "Validation",
          message:
            "Failed to deserialize data from agent process to server. The message has been discarded.",
          attributes: { agentId: agentServer?.id, agentName: agentServer?.definition.name, data },
          cause: error,
        });
      }
      return result;
    },
    onFunctionError: (error) => {
      telemetry.log.error(
        isLifeError(error)
          ? error
          : lifeError({
              code: "Unknown",
              cause: error,
            }),
      );
    },
    onGeneralError: (error) => {
      telemetry.log.error(
        isLifeError(error)
          ? error
          : lifeError({
              code: "Unknown",
              cause: error,
            }),
      );
    },
    // Disable Birpc timeout
    onTimeoutError: () => true,
    timeout: -1,
  },
);

// Register telemetry consumer to forward all signals to parent
TelemetryNodeClient.registerGlobalConsumer({
  start: async (queue: AsyncQueue<TelemetrySignal>) => {
    for await (const signal of queue) rpc.syncTelemetry(signal);
  },
});

// Handle uncaught errors
process.on("uncaughtException", async (error) => {
  telemetry.log.error({ error });
  // Flush telemetry before exiting to ensure error is sent to parent
  await telemetry.flushConsumers(1000);
  process.exit(1);
});
process.on("unhandledRejection", async (reason) => {
  telemetry.log.error({
    message: reason instanceof Error ? reason.message : String(reason),
    error: reason instanceof Error ? reason : undefined,
  });
  // Flush telemetry before exiting to ensure error is sent to parent
  await telemetry.flushConsumers(1000);
  process.exit(1);
});
