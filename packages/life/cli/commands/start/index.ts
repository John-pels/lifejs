import { Command } from "commander";
import type { StartOptions } from "./action";
import { executeStart } from "./action";

export function createStartCommand() {
  const command = new Command("start")
    .description("Start the production server.")
    .helpOption("--help", "Display help for command.")
    .option("-p, --port <port>", "Port to run the server on.", "3000")
    .option("-h, --host <host>", "Host to bind the server to.", "0.0.0.0")
    .option("-c, --config <path>", "Path to life.config.ts file.")
    .action((options: StartOptions) => {
      try {
        executeStart(options);
      } catch (error) {
        if (!(error instanceof Error)) return;
        console.error("\x1b[31mError:\x1b[0m", error.message);
        process.exit(1);
      }
    });

  return command;
}
