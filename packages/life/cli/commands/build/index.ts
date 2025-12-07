import { resolve } from "node:path";
import { Command } from "commander";
import { TelemetryClient } from "@/telemetry/clients/base";
import { BuildOptions, executeBuild } from "./action";

export function createBuildCommand(telemetry: TelemetryClient) {
  const command = new Command("build")
    .description("Build agents for production deployment.")
    .helpOption("--help", "Display help for command.")
    .option("-o, --output <dir>", "Output directory.", ".life")
    .option("-r, --root <dir>", "Project root directory.", resolve(process.cwd()))
    .option("-w, --watch", "Watch for changes and rebuild automatically.")
    .option(
      "--no-optimize",
      "Disable build optimization, e.g., for faster builds during development.",
    )
    .option("--debug", "Enable debug mode logs, same as LOG_LEVEL=debug.")
    .action(async (options: BuildOptions) => await executeBuild(telemetry, options));

  return command;
}
