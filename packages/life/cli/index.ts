#!/usr/bin/env node
import { Command } from "commander";
import { Telemetry } from "@/telemetry/client";
import { createBuildCommand } from "./commands/build";
import { createDevCommand } from "./commands/dev";
import { createInitCommand } from "./commands/init";
import { createStartCommand } from "./commands/start";
import { cliTelemetry } from "./telemetry";
import { formatTelemetryLog } from "./utils/format-telemetry-log";
import { applyHelpFormatting } from "./utils/help-formatter";
import { formatVersion, getVersion } from "./utils/version";

async function main() {
  const program = new Command();
  const version = await getVersion();

  // Retrieve log level
  const logLevel = Telemetry.parseLogLevel(
    process.argv.includes("--debug") ? "debug" : (process.env.LOG_LEVEL ?? "info"),
  );

  // Subscribe to CLI telemetry logs and print them after formatting
  cliTelemetry.registerConsumer({
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

  // Configure the main program
  program
    .name("life")
    .version(formatVersion(version).output, "-v, --version", "Display version number.")
    .helpOption("-h, --help", "Display help for command.")
    .hook("postAction", async () => {
      // Ensure telemetry is flushed
      await cliTelemetry.flush();
      // Add a newline after the command for better readability
      console.log("");
    });

  // Register commands
  const commands = [
    createDevCommand(),
    createBuildCommand(),
    createStartCommand(),
    createInitCommand(),
  ];

  // Apply formatting to commands
  await Promise.all([
    applyHelpFormatting(program, true),
    ...commands.map((c) => applyHelpFormatting(c, false)),
  ]);

  // Add commands to program
  for (const command of commands) program.addCommand(command);

  // Parse command line arguments
  program.parse();

  // Show help if no command provided
  if (!process.argv.slice(2).length) program.outputHelp();
}

main();
