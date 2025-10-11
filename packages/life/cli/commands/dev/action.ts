import { render } from "ink";
import React from "react";
import { loadEnvVars } from "@/cli/utils/load-env-vars";
import type { TelemetryClient } from "@/telemetry/clients/base";
import type { TelemetryLog } from "@/telemetry/types";
import { InitTask } from "./tasks/init";
import { DevUI } from "./ui";

export interface DevOptions {
  root: string;
  port?: string;
  host?: string;
  config?: string;
  token?: string;
  debug?: boolean;
  noTui?: boolean;
}

export const executeDev = async (
  options: DevOptions,
  telemetry: TelemetryClient,
  initialTelemetryLogs: TelemetryLog[],
  onTelemetryLog: (callback: (log: TelemetryLog) => void) => void,
) => {
  try {
    // Load environment vars
    loadEnvVars(options.root);

    // Just call the initialization task if the --no-tui flag is set
    if (options.noTui) {
      const initTask = new InitTask({
        telemetry,
        options,
        // listeners: {
        //   onProgress: setInitProgress,
        //   onStatus: setInitStatus,
        //   onError: (error) => {
        //     telemetry.log.error({ error });
        //     setInitError(error);
        //     exit();
        //   },
        //   onVersion: setVersion,
        //   onServer: (s) => (server.current = s),
        //   onCompiler: (c) => (compiler.current = c),
        // },
      });
      await initTask.run().then(([err]) => {
        if (err) {
          telemetry.log.error({ error: err });
          // setInitError(err.message);
          // exit();
        }
      });
    }

    // Else render the terminal UI
    else {
      render(
        React.createElement(DevUI, { options, telemetry, initialTelemetryLogs, onTelemetryLog }),
        {
          exitOnCtrlC: false,
          patchConsole: false, // We have our own patch in cli/index.ts
        },
      );
    }
  } catch (error) {
    telemetry.log.error({
      message: "An error occurred while starting the development server.",
      error,
    });
  }
};
