import { Command } from "commander";
import { executeStart, type StartOptions } from "./action";

export function createStartCommand() {
  const command = new Command("start")
    .description("Start the production server.")
    .helpOption("--help", "Display help for command.")
    .option("-p, --port <port>", "Port to run the server on.", "3003")
    .option("-h, --host <host>", "Host to bind the server to.", "localhost")
    .option("-b, --build <path>", "Path to build directory.")
    .option("-r, --root <dir>", "Project root directory.", process.cwd())
    .option("-w, --watch", "Watch for changes and hot-reload automatically.")
    .option(
      "-t, --token <token>",
      "Token to authenticate with the server. You can also set LIFE_SERVER_TOKEN environment variable.",
    )
    .option("--debug", "Enable debug mode logs, same as LOG_LEVEL=debug.")
    .action(async (options: StartOptions) => {
      try {
        await executeStart(options);
      } catch (error) {
        if (!(error instanceof Error)) return;
        console.error("\x1b[31mError:\x1b[0m", error.message);
        process.exit(1);
      }
    });

  return command;
}
