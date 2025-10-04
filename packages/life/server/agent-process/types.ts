import type { AgentScope } from "@/agent/server/types";
import type { SerializableValue } from "@/shared/canon";
import type * as op from "@/shared/operation";
import type { TelemetrySignal } from "@/telemetry/types";

// Methods the parent exposes to child processes
export interface ParentMethods {
  // Sync plugin context changes back to parent for crash recovery
  syncContext: ({
    agentId,
    pluginName,
    context,
    timestamp,
  }: {
    agentId: string;
    pluginName: string;
    context: SerializableValue;
    timestamp: number;
  }) => op.OperationResult<void>;

  // Sync telemetry signal to parent
  syncTelemetry: (signal: TelemetrySignal) => op.OperationResult<void>;

  // Ready signal from child when AgentServer is fully started
  ready: () => op.OperationResult<void>;
}

// Methods the child process exposes to parent
export interface ChildMethods {
  // Initialize and start the AgentServer with given configuration
  start: (params: {
    id: string;
    name: string;
    scope: AgentScope;
    transportRoom: { name: string; token: string };
    pluginsContexts: Record<string, SerializableValue>;
    isRestart: boolean;
  }) => Promise<op.OperationResult<void>>;

  // Gracefully stop the AgentServer
  stop: () => Promise<op.OperationResult<void>>;

  // Ping to check if process is responsive
  ping: () => Promise<op.OperationResult<void>>;

  // Get process stats from the child process
  getProcessStats: () => Promise<
    op.OperationResult<{
      cpu: {
        usedPercent: number;
        usedNs: number;
      };
      memory: {
        usedPercent: number;
        totalBytes: number;
        freeBytes: number;
        usedBytes: number;
      };
    }>
  >;
}
