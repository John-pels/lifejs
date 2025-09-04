import { formatTelemetryLog } from "@/cli/utils/format-telemetry-log";
import { generateHeader } from "@/cli/utils/header";
import { loadEnvVars } from "@/cli/utils/load-env-vars";
import { LifeCompiler } from "@/compiler";
import { Telemetry } from "@/telemetry/client";

export interface BuildOptions {
  root: string;
  output?: string;
  watch?: boolean;
  optimize?: boolean;
  debug?: boolean;
}

export const executeBuild = async (options: BuildOptions) => {
  // Print header
  console.log(await generateHeader("Build"));

  // Load environment vars
  loadEnvVars(options.root);

  // Retrieve log level
  const logLevel = Telemetry.parseLogLevel(
    options.debug ? "debug" : (process.env.LOG_LEVEL ?? "info"),
  );

  // Initialize compiler
  const compiler = new LifeCompiler({
    projectDirectory: options.root,
    outputDirectory: options.output,
    watch: options.watch,
    optimize: options.optimize,
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
}