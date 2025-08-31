import { Command } from "commander";
import { formatTelemetryLog } from "@/cli/utils/format-telemetry-log";
import { generateHeader } from "@/cli/utils/header";
import { Compiler } from "@/compiler";
import { Telemetry } from "@/telemetry/client";

interface BuildOptions {
  output?: string;
  root?: string;
  watch?: boolean;
  debug?: boolean;
  optimize?: boolean;
}

export function createBuildCommand() {
  const command = new Command("build")
    .description("Build agents for production deployment.")
    .helpOption("--help", "Display help for command.")
    .option("-o, --output <dir>", "Output directory.", ".life")
    .option("-r, --root <dir>", "Root directory.", process.cwd())
    .option("-w, --watch", "Watch for changes and rebuild automatically.")
    .option(
      "--no-optimize",
      "Disable build optimization, e.g., for faster builds during development.",
    )
    .option("--debug", "Enable debug mode logs, same as LOG_LEVEL=debug.")
    .action(async (options: BuildOptions) => {
      try {
        // Print header
        console.log(await generateHeader("Build"));

        // Retrieve log level
        const logLevel = Telemetry.parseLogLevel(
          options.debug ? "debug" : (process.env.LOG_LEVEL ?? "info"),
        );

        // Initialize compiler
        const compiler = new Compiler({
          projectRoot: options.root ?? process.cwd(),
          outputDir: options.output,
          watch: options.watch,
          optimize: options.optimize !== false,
        });

        // Subscribe to telemetry logs and print them after formatting
        compiler.telemetry.registerConsumer({
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

        // Start compiler
        await compiler.start();

        // Add non-empty last list for readability (if not in watch mode)
        if (!options.watch) console.log(" ");
      } catch (error) {
        if (!(error instanceof Error)) return;
        console.error("\x1b[31mError:\x1b[0m", error.message);
        process.exit(1);
      }
    });

  return command;
}
