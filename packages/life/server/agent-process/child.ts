import { createBirpc } from "birpc";
import { AgentServer } from "@/agent/server/class";
import { importServerBuild } from "@/exports/build/server";
import { canon } from "@/shared/canon";
import * as op from "@/shared/operation";
import { ProcessStats } from "@/shared/process-stats";
import { createTelemetryClient } from "@/telemetry/clients/node";
import type { ChildMethods, ParentMethods } from "./types";

let agentServer: AgentServer | null = null;

const processStats = new ProcessStats();

// biome-ignore lint/suspicious/noExplicitAny: attributes are going to be rewritten by the parent process anyway
const telemetry = createTelemetryClient("server", { watch: false } as any);

// Create RPC channel with parent process
const rpc = createBirpc<ParentMethods, ChildMethods>(
  {
    // biome-ignore lint/suspicious/useAwait: not needed
    async injectEnvVars(vars) {
      telemetry.log.debug({ message: `Injecting environment variables: ${JSON.stringify(vars)}` });
      process.env = { ...process.env, ...vars };
      telemetry.log.debug({
        message: `Environment variables injected: ${JSON.stringify(process.env)}`,
      });
      return op.success();
    },
    async start(params) {
      try {
        // Retrieve the agent definition
        const [errImport, servers] = await op.attempt(
          importServerBuild({ projectDirectory: process.cwd(), noCache: true }),
        );
        if (errImport) return op.failure(errImport);
        const server = servers?.[params.name as keyof typeof servers];
        if (!server)
          return op.failure({ code: "NotFound", message: `Agent '${params.name}' not found.` });
        const definition = server.definition;

        // Create the agent server
        const [errCreate, instance] = op.attempt(
          () =>
            new AgentServer({
              id: params.id,
              definition: server.definition,
              scope: params.scope,
              sha: server.sha,
              pluginsContexts: params.pluginsContexts,
              isRestart: params.isRestart,
            }),
        );
        if (errCreate) return op.failure(errCreate);
        agentServer = instance;

        // Stream plugin context changes to parent
        for (const pluginName of Object.keys(definition.plugins)) {
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
                  message: `Failed to sync for plugin '${pluginName}' in agent '${agentServer._definition.name}' process.`,
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
        return op.failure({ code: "Unknown", error });
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
        return op.failure({ code: "Unknown", error });
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
        return op.failure({ code: "Unknown", error });
      }
    },
  },
  {
    post: (data) => process.send?.(data),
    on: (fn) => process.on("message", fn),
    serialize: canon.serialize,
    deserialize: canon.deserialize,
    timeout: -1,
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
