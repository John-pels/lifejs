import { randomBytes } from "node:crypto";
import chalk from "chalk";
import { cliTelemetry } from "@/cli/telemetry";
import { formatTelemetryLog } from "@/cli/utils/format-telemetry-log";
import { generateHeader } from "@/cli/utils/header";
import { loadEnvVars } from "@/cli/utils/load-env-vars";
import { LifeServer } from "@/server";
import { Telemetry } from "@/telemetry/client";

export interface StartOptions {
  root: string;
  watch?: boolean;
  port?: string;
  host?: string;
  debug?: boolean;
  token?: string;
}

export const executeStart = async (options: StartOptions) => {
  // Print header
  console.log(await generateHeader("Server"));

  // Load environment vars
  loadEnvVars(options.root);

  // Retrieve server token from options or environment variable
  const serverToken = options.token ?? process.env.LIFE_SERVER_TOKEN;
  if (!serverToken) {
    cliTelemetry.log.error({
      message: `Server token is required. Please provide it via --token flag or set LIFE_SERVER_TOKEN environment variable.\n\nHere is one generated for you :)\n\n${chalk.bold(`LIFE_SERVER_TOKEN=${randomBytes(32).toString("base64url")}`)}\n\nJust put it in your .env file.`,
    });
    return;
  }

  // Initialize server
  const server = new LifeServer({
    projectDirectory: options.root,
    token: serverToken,
    watch: options.watch,
    host: options.host,
    port: options.port,
  });

  // Retrieve log level
  const logLevel = Telemetry.parseLogLevel(
    options.debug ? "debug" : (process.env.LOG_LEVEL ?? "info"),
  );

  // Subscribe to telemetry logs and print them after formatting
  server.telemetry.registerConsumer({
    async start(queue) {
      for await (const item of queue) {
        if (item.type === "log") {
          // Ignore logs lower than the requested log level
          if (Telemetry.logLevelPriority(item.level) < Telemetry.logLevelPriority(logLevel))
            continue;

          // Format and print the log
          try {
            console.log(await formatTelemetryLog(item));
          } catch {
            // Fallback to raw output if formatting fails
            console.log(item.message);
          }
        }
      }
    },
  });

  // Start server
  await server.start();
};
