import chalk from "chalk";
import type { TelemetryClient } from "../clients/base";
import type { TelemetryLogInput } from "../types";

export const pipeConsoleToTelemetryClient = (telemetry: TelemetryClient) => {
  const consoleMethods = ["log", "error", "warn", "info", "debug"] as const;
  for (const method of consoleMethods) {
    console[method] = (...args: unknown[]) => {
      const logLine = args.map((arg) => String(arg)).join(" ");
      let logFn: (input: TelemetryLogInput) => void;
      if (method === "error") logFn = telemetry.log.error;
      else if (method === "warn") logFn = telemetry.log.warn;
      else if (method === "info") logFn = telemetry.log.info;
      else if (method === "debug") logFn = telemetry.log.debug;
      else logFn = telemetry.log.info;
      logFn({ message: `${chalk.italic.gray(`(from console.${method})`)} ${logLine}` });
    };
  }
};
