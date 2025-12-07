import { Command } from "commander";
import { TelemetryClient } from "@/telemetry/clients/base";
import { createTelemetryClient } from "@/telemetry/clients/node";
import { formatLogForTerminal } from "@/telemetry/helpers/formatting/terminal";
import { pipeConsoleToTelemetryClient } from "@/telemetry/helpers/patch-console";
import type { TelemetryLog, TelemetryLogLevel } from "@/telemetry/types";
import { createBuildCommand } from "./commands/build";
import { createDevCommand } from "./commands/dev";
import { createInitCommand } from "./commands/init";
import { createStartCommand } from "./commands/start";
import { applyHelpFormatting } from "./utils/help-formatter";
import { formatVersion, getVersion } from "./utils/version";

async function main() {
  // Capture initial telemetry logs, and expose a callback to listen for new logs
  let logLevel = process.argv.includes("--debug") ? "debug" : undefined;
  logLevel = logLevel ?? (process.env.LOG_LEVEL as TelemetryLogLevel) ?? "info";
  const logs: TelemetryLog[] = [];
  const logsListeners: ((log: TelemetryLog) => void)[] = [];
  const onTelemetryLog = (callback: (log: TelemetryLog) => void) => {
    logsListeners.push(callback);
    return () => {
      logsListeners.splice(logsListeners.indexOf(callback), 1);
    };
  };
  TelemetryClient.registerGlobalConsumer({
    async start(queue) {
      for await (const item of queue) {
        if (item.type !== "log") continue;
        try {
          logs.push(item);
          for (const listener of logsListeners) listener(item);
        } catch {
          console.error("Failed to forward telemetry log to listeners.");
        }
      }
    },
  });

  // Stream formatted telemetry logs to the terminal (except for dev command without --no-tui flag)
  const originalConsoleLog = console.log;
  const isDevCommand = process.argv.includes("dev") && !process.argv.includes("--no-tui");
  if (!isDevCommand) {
    TelemetryClient.registerGlobalConsumer({
      start: async (queue) => {
        for await (const item of queue) {
          if (item.type !== "log") continue;
          originalConsoleLog(formatLogForTerminal(item));
        }
      },
    });
  }

  // Create the CLI telemety client
  const cliTelemetry = createTelemetryClient("cli", {
    command: process.argv.at(2) ?? "unknown",
    args: process.argv.slice(3) ?? [],
  });

  // Forward console.* methods to the CLI telemetry client
  pipeConsoleToTelemetryClient(cliTelemetry);

  // Set up cleanup function to run before process exits
  let cleanupDone = false;
  const cleanup = async () => {
    if (cleanupDone) return;
    cleanupDone = true;
    await TelemetryClient.flushAllConsumers();
    originalConsoleLog(""); // Newline for better readability
  };
  process.on("SIGINT", () => setImmediate(cleanup));
  process.on("SIGTERM", () => setImmediate(cleanup));
  process.on("beforeExit", cleanup);
  process.on("exit", cleanup);

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
    createDevCommand(cliTelemetry, logs, onTelemetryLog),
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
