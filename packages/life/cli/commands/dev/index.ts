import { Command } from "commander";
import type { TelemetryClient } from "@/telemetry/base";
import type { DevOptions } from "./ui";
import { executeDev } from "./ui";

export function createDevCommand(telemetry: TelemetryClient) {
  const command = new Command("dev")
    .description("Start the development server.")
    .helpOption("--help", "Display help for command.")
    .option("-p, --port <port>", "Port to run the server on.", "3000")
    .option("-h, --host <host>", "Host to bind the server to.", "localhost")
    .option("-c, --config <path>", "Path to life.config.ts file.")
    .option("--no-tui", "Disable the terminal UI.")
    .action((options: DevOptions) => executeDev(telemetry, options));

  return command;
}
