import * as op from "@/shared/operation";
import { TelemetryClient } from "@/telemetry/clients/base";
import type { TelemetryConsumer } from "@/telemetry/types";
import type { definition } from "./definition";
import type { LifeApiHandlers, LifeApiStreamSendFunction } from "./types";

export const getHandlers = (serverTelemetry: TelemetryClient) =>
  ({
    "telemetry.send-signal": {
      onCast: ({ data }) => {
        // Ensure the signal scope is client to prevent server-side telemetry data tampering
        if (["client", "agent.client", "plugin.client"].includes(data.signal.scope))
          return op.failure({
            code: "Validation",
            message: `Telemetry signal scope must be in ["client", "agent.client", "plugin.client"].`,
            isPublic: true,
          });

        // Send the signal
        serverTelemetry.sendSignal(data.signal);

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
          if (event.action === "add") subscribers.set(event.subscriptionId, { send: event.send });
          else if (event.action === "remove") subscribers.delete(event.subscriptionId);
        }
      },
    },
    "agent.create": {
      onCall: async ({ api, data }) => {
        const { id, name } = data;
        return await api.server.agent.create({ id, name });
      },
    },
    "agent.start": {
      onCall: async ({ api, data, request }) => {
        const { id, scope } = data;
        return await api.server.agent.start({ id, request, scope });
      },
    },
    "agent.stop": {
      onCall: async ({ api, data }) => {
        const { id, sessionToken } = data;
        return await api.server.agent.stop({ id, sessionToken });
      },
    },
    "agent.ping": {
      onCall: async ({ api, data }) => {
        const { id, sessionToken } = data;
        return await api.server.agent.ping({ id, sessionToken });
      },
    },
    "agent.info": {
      onCall: async ({ api, data }) => {
        const { id, sessionToken } = data;
        return await api.server.agent.info({ id, sessionToken });
      },
    },
    "server.ping": {
      onCall: (_) => op.success("pong"),
    },
    "server.available": {
      onCall: ({ api }) => api.server.server.available(),
    },
    "server.info": {
      onCall: async ({ api }) => await api.server.server.info(),
    },
    "agent.info-stream": {
      onStart: async ({ queue, api }) => {
        // Track subscribers
        const subscribers = new Map<string, { intervalId: NodeJS.Timeout }>();

        // Handle subcriptions events
        for await (const event of queue) {
          if (event.action === "add") {
            const { pollingIntervalMs, ...infoParams } = event?.data ?? {};
            subscribers.set(event.subscriptionId, {
              intervalId: setInterval(async () => {
                const [errGet, info] = await api.server.agent.info(infoParams);
                if (errGet) return event.send(op.failure(errGet));
                event.send(op.success(info));
              }, pollingIntervalMs),
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
                const [errGet, info] = await api.server.server.info();
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
      onCall: ({ api }) => api.server.server.processes(),
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
                const [errGet, processes] = api.server.server.processes();
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
