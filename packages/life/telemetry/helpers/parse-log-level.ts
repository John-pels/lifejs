import { type TelemetryLogLevel, telemetryLogLevels } from "../types";

export function parseLogLevel(level: string): TelemetryLogLevel {
  if (telemetryLogLevels.includes(level.toLowerCase().trim() as TelemetryLogLevel))
    return level as TelemetryLogLevel;
  return "info";
}
