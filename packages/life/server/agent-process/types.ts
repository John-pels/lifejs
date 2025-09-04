import type { AgentScope } from "@/agent/server/types";
import type { SerializableValue } from "@/shared/canon";
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
  }) => void;

  // Sync telemetry signal to parent
  syncTelemetry: (signal: TelemetrySignal) => void;

  // Ready signal from child when AgentServer is fully started
  ready: () => void;
}

// Methods the child process exposes to parent
export interface ChildMethods {
  // Inject environment variables into the child process
  injectEnvVars: (vars: Record<string, string | undefined>) => void;

  // Initialize and start the AgentServer with given configuration
  start: (params: {
    id: string;
    name: string;
    scope: AgentScope;
    transportRoom: { name: string; token: string };
    pluginsContexts: Record<string, SerializableValue>;
    isRestart: boolean;
  }) => Promise<{ success: boolean; message?: string }>;

  // Gracefully stop the AgentServer
  stop: () => Promise<{ success: boolean; message?: string }>;

  // Ping to check if process is responsive
  ping: () => Promise<{ success: boolean; message?: string }>;

  // Get process stats from the child process
  getProcessStats: () => Promise<
    | {
        success: true;
        stats: {
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
        };
      }
    | {
        success: false;
        message: string;
      }
  >;
}
