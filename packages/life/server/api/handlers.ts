import * as op from "@/shared/operation";
import { TelemetryClient } from "@/telemetry/base";
import type { TelemetryConsumer } from "@/telemetry/types";
import type { definition } from "./definition";
import type { LifeApiHandlers, LifeApiStreamSendFunction } from "./types";

export const getHandlers = (serverTelemetry: TelemetryClient) =>
  ({
    "telemetry.send-signal": {
      onCast: ({ data }) => {
        serverTelemetry.sendSignal(data.signal);
        // Ensure the signal scope is client to prevent server-side telemetry data tampering
        if (["client", "agent.client", "plugin.client"].includes(data.signal.scope))
          return op.failure({
            code: "InvalidInput",
            message: `Telemetry signal scope must be in ["client", "agent.client", "plugin.client"].`,
          });
        return op.success();
      },
    },
    "telemetry.signals-stream": {
      onStart: async ({ queue }) => {
        // Track subscribers
        const subscribers = new Map<
          string,
          { send: LifeApiStreamSendFunction<(typeof definition)["telemetry.signals-stream"]> }
        >();

        // Register consumer to receive telemetry signals
        TelemetryClient.registerGlobalConsumer({
          isProcessing: () => false,
          start: async (_queue: Parameters<TelemetryConsumer["start"]>[0]) => {
            for await (const signal of _queue) {
              for (const subscriber of subscribers.values()) {
                subscriber.send(op.success(signal));
              }
            }
          },
        });

        // Handle subcriptions events
        for await (const event of queue) {
          if (event.action === "add") {
            subscribers.set(event.subscriptionId, { send: event.send });
          } else if (event.action === "remove") {
            subscribers.delete(event.subscriptionId);
          }
        }
      },
    },
    "agent.create": {
      onCall: async ({ api, data, request }) => {
        const { name, scope } = data;
        return await api.server.createAgentProcess({ name, scope, request });
      },
    },
    "agent.start": {
      onCall: async ({ api, data }) => {
        const { agentId, sessionToken } = data;
        return await api.server.startAgentProcess(agentId, sessionToken);
      },
    },
    "agent.stop": {
      onCall: async ({ api, data }) => {
        const { agentId, sessionToken } = data;
        return await api.server.stopAgentProcess(agentId, sessionToken);
      },
    },
    "agent.ping": {
      onCall: async ({ api, data }) => {
        const { agentId, sessionToken } = data;
        return await api.server.pingAgentProcess(agentId, sessionToken);
      },
    },
    "agent.info": {
      onCall: async ({ api, data }) => {
        const { agentId, sessionToken } = data;
        return await api.server.getAgentProcessInfo(agentId, sessionToken);
      },
    },
    "server.ping": {
      onCall: (_) => {
        return op.success("pong");
      },
    },
    "server.info": {
      onCall: async ({ api }) => {
        return await api.server.getServerInfo();
      },
    },
    "agent.info-stream": {
      onStart: async ({ queue, api }) => {
        // Track subscribers
        const subscribers = new Map<string, { intervalId: NodeJS.Timeout }>();

        // Handle subcriptions events
        for await (const event of queue) {
          if (event.action === "add") {
            subscribers.set(event.subscriptionId, {
              intervalId: setInterval(async () => {
                const [errGet, info] = await api.server.getAgentProcessInfo(
                  event.data.agentId,
                  event.data.sessionToken,
                );
                if (errGet) return event.send(op.failure(errGet));
                event.send(op.success(info));
              }, event.data.pollingIntervalMs),
            });
          } else if (event.action === "remove") {
            clearInterval(subscribers.get(event.subscriptionId)?.intervalId);
            subscribers.delete(event.subscriptionId);
          }
        }
      },
    },
    "server.info-stream": {
      onStart: async ({ queue, api }) => {
        // Track subscribers
        const subscribers = new Map<string, { intervalId: NodeJS.Timeout }>();

        // Handle subcriptions events
        for await (const event of queue) {
          if (event.action === "add") {
            subscribers.set(event.subscriptionId, {
              intervalId: setInterval(async () => {
                const [errGet, info] = await api.server.getServerInfo();
                if (errGet) return event.send(op.failure(errGet));
                event.send(op.success(info));
              }, event.data.pollingIntervalMs),
            });
          } else if (event.action === "remove") {
            clearInterval(subscribers.get(event.subscriptionId)?.intervalId);
            subscribers.delete(event.subscriptionId);
          }
        }
      },
    },
    "server.processes": {
      onCall: ({ api }) => {
        return api.server.listAgentProcesses();
      },
    },
    "server.processes-stream": {
      onStart: async ({ queue, api }) => {
        // Track subscribers
        const subscribers = new Map<string, { intervalId: NodeJS.Timeout }>();

        // Handle subcriptions events
        for await (const event of queue) {
          if (event.action === "add") {
            subscribers.set(event.subscriptionId, {
              intervalId: setInterval(() => {
                const [errGet, processes] = api.server.listAgentProcesses();
                if (errGet) return event.send(op.failure(errGet));
                event.send(op.success(processes));
              }, event.data.pollingIntervalMs),
            });
          } else if (event.action === "remove") {
            clearInterval(subscribers.get(event.subscriptionId)?.intervalId);
            subscribers.delete(event.subscriptionId);
          }
        }
      },
    },
  }) satisfies LifeApiHandlers<typeof definition>;
