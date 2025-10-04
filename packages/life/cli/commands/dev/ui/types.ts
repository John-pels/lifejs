import type { TelemetryLogLevel } from "@/telemetry/types";

export type DevLog = {
  id: string;
  timestamp: number;
  level: TelemetryLogLevel;
  line: string;
};
