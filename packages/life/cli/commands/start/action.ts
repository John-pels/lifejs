import { randomBytes } from "node:crypto";
import chalk from "chalk";
import { generateHeader } from "@/cli/utils/header";
import { loadEnvVars } from "@/cli/utils/load-env-vars";
import { LifeServer } from "@/server";
import type { TelemetryClient } from "@/telemetry/clients/base";

export interface StartOptions {
  root: string;
  watch?: boolean;
  port?: string;
  host?: string;
  debug?: boolean;
  token?: string;
}

const errorMessage = "An error occurred while starting the server.";

export const executeStart = async (telemetry: TelemetryClient, options: StartOptions) => {
  try {
    // Print header
    console.log(await generateHeader("Server"));

    // Load environment vars
    loadEnvVars(options.root);

    // Retrieve server token from options or environment variable
    const serverToken = options.token ?? process.env.LIFE_SERVER_TOKEN;
    if (!serverToken) {
      telemetry.log.error({
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

    // Start server
    const [errStart] = await server.start();
    if (errStart) telemetry.log.error({ message: errorMessage, error: errStart });
  } catch (error) {
    telemetry.log.error({ message: errorMessage, error });
  }
};
