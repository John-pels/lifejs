import type { TelemetryLogLevel } from "../types";

export function logLevelPriority(level: TelemetryLogLevel) {
  if (level === "fatal") return 4;
  if (level === "error") return 3;
  if (level === "warn") return 2;
  if (level === "info") return 1;
  return 0;
}
