import { render } from "ink";
import React from "react";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { TelemetryLog } from "@/telemetry/types";
import { DevUI } from "./ui";

export interface DevOptions {
  root: string;
  port?: string;
  host?: string;
  config?: string;
  token?: string;
  debug?: boolean;
  tui?: boolean;
}

export const executeDev = (
  options: DevOptions,
  telemetry: TelemetryClient,
  initialTelemetryLogs: TelemetryLog[],
  onTelemetryLog: (callback: (log: TelemetryLog) => void) => void,
) => {
  try {
    // Render the terminal UI if enabled
    if (options.tui) {
      render(
        React.createElement(DevUI, { options, telemetry, initialTelemetryLogs, onTelemetryLog }),
        {
          exitOnCtrlC: false,
          patchConsole: false, // We have our own patch in cli/index.ts
          incrementalRendering: true,
          maxFps: 25
        },
      );
    }
    // Else just call the initialization task
    else telemetry.log.warn({ message: "--no-tui mode is not implemented yet." });
  } catch (error) {
    telemetry.log.error({
      message: "An error occurred while starting the development server.",
      error,
    });
  }
};
