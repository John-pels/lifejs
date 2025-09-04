import { createBirpc } from "birpc";
import { AgentServer } from "@/agent/server/class";
import { importServerBuild } from "@/exports/build/server";
import { canon } from "@/shared/canon";
import { ProcessStats } from "@/shared/process-stats";
import { lifeTelemetry } from "@/telemetry/client";
import type { ChildMethods, ParentMethods } from "./types";

let agentServer: AgentServer | null = null;
const processStats = new ProcessStats();

// Scope is going to be rewritten by the parent process anwyay
const telemetry = lifeTelemetry;

// Create RPC channel with parent process
const rpc = createBirpc<ParentMethods, ChildMethods>(
  {
    // biome-ignore lint/suspicious/useAwait: not needed
    async injectEnvVars(vars) {
      process.env = { ...process.env, ...vars };
    },
    async start(params) {
      try {
        // Create the agent server
        const servers = await importServerBuild();
        const definition = servers?.[params.name as keyof typeof servers]?.definition;
        agentServer = new AgentServer({
          id: params.id,
          definition,
          scope: params.scope,
          pluginsContexts: params.pluginsContexts,
          isRestart: params.isRestart,
        });

        // Stream plugin context changes to parent
        for (const pluginName of Object.keys(definition.plugins)) {
          agentServer.plugins[pluginName]?.onContextChange(
            (c) => c,
            async (c) => {
              if (!agentServer) return;
              await rpc.syncContext({
                agentId: agentServer.id,
                pluginName,
                context: c,
                timestamp: Date.now(),
              });
            },
          );
        }

        // Start the agent server
        await agentServer.start();

        // Register transport room
        await agentServer.transport.joinRoom(params.transportRoom.name, params.transportRoom.token);

        // Notify parent that agent is ready
        await rpc.ready();

        // Return that the agent server was started successfully
        return { success: true };
      } catch (error) {
        const message = "Failed to start agent server.";
        telemetry.log.error({ message, error });
        return { success: false, message };
      }
    },

    async stop() {
      if (agentServer) {
        const result = await agentServer.stop();
        if (!result.success) return result;
        agentServer = null;
      }
      return { success: true };
    },

    // Simple ping to check if process is responsive
    async ping() {
      await Promise.resolve();
      return { success: true };
    },

    // Get detailed stats from the child process
    async getProcessStats() {
      return { success: true, stats: await processStats.get() };
    },
  },
  {
    post: (data) => process.send?.(data),
    on: (fn) => process.on("message", fn),
    serialize: canon.serialize,
    deserialize: canon.deserialize,
  },
);

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  telemetry.log.error({ error });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  telemetry.log.error({ message: reason instanceof Error ? reason.message : String(reason) });
  process.exit(1);
});

// Graceful shutdown on SIGTERM
// process.on("SIGTERM", async () => {
//   if (agentServer) await agentServer.stop();
//   process.exit(0);
// });
