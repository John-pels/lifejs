#!/usr/bin/env node
import { Command } from "commander";
import { createBuildCommand } from "./commands/build";
import { createDevCommand } from "./commands/dev";
import { createInitCommand } from "./commands/init";
import { createStartCommand } from "./commands/start";
import { applyHelpFormatting } from "./utils/help-formatter";
import { formatVersion, getVersion } from "./utils/version";

async function main() {
  const program = new Command();

  const version = await getVersion();

  // Configure the main program
  program
    .name("life")
    .version(formatVersion(version).output, "-v, --version", "Display version number.")
    .helpOption("-h, --help", "Display help for command.");

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
