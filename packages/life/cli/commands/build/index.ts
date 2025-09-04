import { Command } from "commander";
import { BuildOptions, executeBuild } from "./action";

export function createBuildCommand() {
  const command = new Command("build")
    .description("Build agents for production deployment.")
    .helpOption("--help", "Display help for command.")
    .option("-o, --output <dir>", "Output directory.", ".life")
    .option("-r, --root <dir>", "Project root directory.", process.cwd())
    .option("-w, --watch", "Watch for changes and rebuild automatically.")
    .option(
      "--no-optimize",
      "Disable build optimization, e.g., for faster builds during development.",
    )
    .option("--debug", "Enable debug mode logs, same as LOG_LEVEL=debug.")
    .action(async (options: BuildOptions) => {
      try {
        await executeBuild(options);
      } catch (error) {
        if (!(error instanceof Error)) return;
        console.error("\x1b[31mError:\x1b[0m", error.message);
        process.exit(1);
      }
    });

  return command;
}
