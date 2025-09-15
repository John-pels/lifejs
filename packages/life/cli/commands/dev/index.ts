import { Command } from "commander";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { type DevOptions, executeDev } from "./action";

export function createDevCommand(telemetry: TelemetryClient) {
  const command = new Command("dev")
    .description("Start the development server.")
    .helpOption("--help", "Display help for command.")
    .option("-p, --port <port>", "Port to run the server on.", "3000")
    .option("-h, --host <host>", "Host to bind the server to.", "localhost")
    .option("-r, --root <dir>", "Project root directory.", process.cwd())
    .option(
      "-t, --token <token>",
      "Token to authenticate with the server. You can also set LIFE_SERVER_TOKEN environment variable.",
    )
    .option("--debug", "Enable debug mode logs, same as LOG_LEVEL=debug.")
    .action((options: DevOptions) => executeDev(telemetry, options));

  return command;
}
