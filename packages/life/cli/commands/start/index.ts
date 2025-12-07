import { resolve } from "node:path";
import { Command } from "commander";
import type { TelemetryClient } from "@/telemetry/clients/base";
import { executeStart, type StartOptions } from "./action";

export function createStartCommand(telemetry: TelemetryClient) {
  const command = new Command("start")
    .description("Start the production server.")
    .helpOption("--help", "Display help for command.")
    .option("-p, --port <port>", "Port to run the server on.", "3003")
    .option("-h, --host <host>", "Host to bind the server to.", "localhost")
    .option("-r, --root <dir>", "Project root directory.", resolve(process.cwd()))
    .option("-w, --watch", "Watch for changes and hot-reload automatically.")
    .option(
      "-t, --token <token>",
      "Token to authenticate with the server. You can also set LIFE_SERVER_TOKEN environment variable.",
    )
    .option("--debug", "Enable debug mode logs, same as LOG_LEVEL=debug.")
    .action(async (options: StartOptions) => await executeStart(telemetry, options));

  return command;
}
