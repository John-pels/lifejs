import z from "zod";
import { agentClientConfig } from "@/agent/client/config";
import { telemetrySignalSchema } from "@/telemetry/schemas";
import type { LifeApiDefinition } from "./types";

export const definition = {
  "telemetry.send-signal": {
    type: "cast",
    protected: false,
    inputDataSchema: z.object({
      signal: telemetrySignalSchema,
    }),
  },
  "telemetry.signals-stream": {
    type: "stream",
    protected: true,
    outputDataSchema: telemetrySignalSchema,
  },
  "agent.create": {
    type: "call",
    protected: false,
    inputDataSchema: z.object({
      id: z.string().optional(),
      name: z.string(),
    }),
    outputDataSchema: z.object({
      id: z.string(),
      clientConfig: agentClientConfig.schema,
    }),
  },
  "agent.start": {
    type: "call",
    protected: false,
    inputDataSchema: z.object({
      id: z.string(),
      scope: z.object({}),
    }),
    outputDataSchema: z.object({
      sessionToken: z.string(),
      transportRoom: z.object({ name: z.string(), token: z.string() }),
    }),
  },
  "agent.stop": {
    type: "call",
    protected: false,
    inputDataSchema: z.object({
      id: z.string(),
      sessionToken: z.string(),
    }),
  },
  "agent.ping": {
    type: "call",
    protected: false,
    inputDataSchema: z.object({
      id: z.string(),
      sessionToken: z.string(),
    }),
    outputDataSchema: z.literal("pong"),
  },
  "agent.info": {
    type: "call",
    protected: false,
    inputDataSchema: z.object({
      id: z.string(),
      sessionToken: z.string(),
    }),
    outputDataSchema: z.object({
      id: z.string(),
      name: z.string(),
      scope: z.record(z.string(), z.unknown()),
      status: z.enum(["stopped", "starting", "running", "stopping"]),
      lastStartedAt: z.number().optional(),
      lastSeenAt: z.number().optional(),
      restartCount: z.number(),
      cpu: z.object({
        usedPercent: z.number(),
        usedNs: z.number(),
      }),
      memory: z.object({
        usedPercent: z.number(),
        totalBytes: z.number(),
        freeBytes: z.number(),
        usedBytes: z.number(),
      }),
    }),
  },
  "agent.info-stream": {
    type: "stream",
    protected: false,
    inputDataSchema: z.object({
      id: z.string(),
      sessionToken: z.string(),
      pollingIntervalMs: z.number().min(1000).max(30_000).default(5000),
    }),
    outputDataSchema: z.object({
      id: z.string(),
      name: z.string(),
      scope: z.record(z.string(), z.unknown()),
      status: z.string(),
      lastStartedAt: z.number().optional(),
      lastSeenAt: z.number().optional(),
      restartCount: z.number(),
      cpu: z.object({
        usedPercent: z.number(),
        usedNs: z.number(),
      }),
      memory: z.object({
        usedPercent: z.number(),
        totalBytes: z.number(),
        freeBytes: z.number(),
        usedBytes: z.number(),
      }),
    }),
  },
  "server.ping": {
    type: "call",
    protected: true,
    outputDataSchema: z.literal("pong"),
  },
  "server.available": {
    type: "call",
    protected: true,
    outputDataSchema: z.array(z.object({ name: z.string(), scopeKeys: z.array(z.string()) })),
  },
  "server.info": {
    type: "call",
    protected: true,
    outputDataSchema: z.object({
      lifeVersion: z.string(),
      nodeVersion: z.string(),
      startedAt: z.number(),
      cpu: z.object({
        usedPercent: z.number(),
        usedNs: z.number(),
      }),
      memory: z.object({
        usedPercent: z.number(),
        totalBytes: z.number(),
        freeBytes: z.number(),
        usedBytes: z.number(),
      }),
    }),
  },
  "server.info-stream": {
    type: "stream",
    protected: true,
    inputDataSchema: z.object({
      pollingIntervalMs: z.number().min(1000).max(30_000).default(5000),
    }),
    outputDataSchema: z.object({
      lifeVersion: z.string(),
      nodeVersion: z.string(),
      startedAt: z.number(),
      cpu: z.object({
        usedPercent: z.number(),
        usedNs: z.number(),
      }),
      memory: z.object({
        usedPercent: z.number(),
        totalBytes: z.number(),
        freeBytes: z.number(),
        usedBytes: z.number(),
      }),
    }),
  },
  "server.processes": {
    type: "call",
    protected: true,
    outputDataSchema: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        lastStartedAt: z.number().optional(),
      }),
    ),
  },
  "server.processes-stream": {
    type: "stream",
    protected: true,
    inputDataSchema: z.object({
      pollingIntervalMs: z.number().min(1000).max(30_000).default(5000),
    }),
    outputDataSchema: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        lastStartedAt: z.number().optional(),
      }),
    ),
  },
} as const satisfies LifeApiDefinition;
