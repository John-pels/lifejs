import { logLevelPriority } from "@/telemetry/helpers/log-level-priority";
import type { TelemetryLog, TelemetryLogLevel } from "@/telemetry/types";

export const filterTabLogs = (
  logs: TelemetryLog[],
  selectedTab: string,
  logLevel: TelemetryLogLevel,
) =>
  logs.filter((log) => {
    let logTab = "cli";
    if (log.scope === "server") logTab = "server";
    else if (log.scope === "compiler") logTab = "compiler";
    else if (log.scope === "webrtc") logTab = "webrtc";
    else if (
      (log.scope === "agent.process" ||
        log.scope === "agent.server" ||
        log.scope === "plugin.server") &&
      log.attributes?.agentId
    )
      logTab = log.attributes.agentId as string;
    if (logTab !== selectedTab) return false;
    return logLevelPriority(log.level) >= logLevelPriority(logLevel);
  });
