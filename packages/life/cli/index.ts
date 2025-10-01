#!/usr/bin/env node --enable-source-maps

import { Command } from "commander";
import { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/node";
import { formatLogForTerminal } from "@/telemetry/helpers/formatting/terminal";
import { logLevelPriority } from "@/telemetry/helpers/log-level-priority";
import type { TelemetryLogLevel } from "@/telemetry/types";
import { createBuildCommand } from "./commands/build";
import { createDevCommand } from "./commands/dev";
import { createInitCommand } from "./commands/init";
import { createStartCommand } from "./commands/start";
import { applyHelpFormatting } from "./utils/help-formatter";
import { formatVersion, getVersion } from "./utils/version";

async function main() {
  // Stream formatted telemetry logs to the terminal (except for dev command without --no-tui flag)
  let logLevel = process.argv.includes("--debug") ? "debug" : undefined;
  const isDevCommand = process.argv.includes("dev") && !process.argv.includes("--no-tui");
  logLevel = logLevel ?? (process.env.LOG_LEVEL as TelemetryLogLevel) ?? "info";
  if (!isDevCommand) {
    TelemetryClient.registerGlobalConsumer({
      async start(queue) {
        for await (const item of queue) {
          if (item.type !== "log") continue;
          // Ignore logs lower than the requested log level
          if (logLevelPriority(item.level) < logLevelPriority(logLevel as TelemetryLogLevel))
            continue;

          // Format and print the log
          try {
            console.log(formatLogForTerminal(item));
          } catch {
            console.log(item.message);
          }
        }
      },
    });
  }

  // Set up cleanup function to run before process exits
  let cleanupDone = false;
  const cleanup = async () => {
    if (cleanupDone) return;
    cleanupDone = true;
    await TelemetryClient.flushAllConsumers();
    console.log(""); // Newline for better readability
  };
  process.on("SIGINT", () => setImmediate(cleanup));
  process.on("SIGTERM", () => setImmediate(cleanup));
  process.on("beforeExit", cleanup);
  process.on("exit", cleanup);

  // Create the CLI telemety client
  const cliTelemetry = createTelemetryClient("cli", {
    command: process.argv.at(2) ?? "unknown",
    args: process.argv.slice(3) ?? [],
  });

  // Initialize program
  const program = new Command();
  const version = await getVersion();

  // Configure the main program
  program
    .name("life")
    .version(formatVersion(version).output, "-v, --version", "Display version number.")
    .helpOption("-h, --help", "Display help for command.");

  // Register commands
  const commands = [
    createDevCommand(cliTelemetry),
    createBuildCommand(cliTelemetry),
    createStartCommand(cliTelemetry),
    createInitCommand(cliTelemetry),
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
