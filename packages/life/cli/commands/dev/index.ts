import { Command } from "commander";
import type { DevOptions } from "./ui";
import { executeDev } from "./ui";

export function createDevCommand() {
  const command = new Command("dev")
    .description("Start the development server.")
    .helpOption("--help", "Display help for command.")
    .option("-p, --port <port>", "Port to run the server on.", "3000")
    .option("-h, --host <host>", "Host to bind the server to.", "localhost")
    .option("-c, --config <path>", "Path to life.config.ts file.")
    .option("--no-tui", "Disable the terminal UI.")
    .action((options: DevOptions) => {
      try {
        executeDev(options);
      } catch (error) {
        if (!(error instanceof Error)) return;
        console.error("\x1b[31mError:\x1b[0m", error.message);
        process.exit(1);
      }
    });

  return command;
}
