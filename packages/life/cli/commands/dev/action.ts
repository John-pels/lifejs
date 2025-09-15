import { render } from "ink";
import React from "react";
import { loadEnvVars } from "@/cli/utils/load-env-vars";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { DevUI } from "./ui";

export interface DevOptions {
  root: string;
  port?: string;
  host?: string;
  config?: string;
  token?: string;
  debug?: boolean;
}

export const executeDev = (telemetry: TelemetryClient, options: DevOptions) => {
  try {
    // Load environment vars
    loadEnvVars(options.root);

    // Render the terminal UI
    render(React.createElement(DevUI, { options, telemetry }), {
      exitOnCtrlC: true,
    });
  } catch (error) {
    telemetry.log.error({
      message: "An error occurred while starting the development server.",
      error,
    });
  }
};
