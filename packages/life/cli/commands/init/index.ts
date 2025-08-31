import { Command } from "commander";
import { generateHeader } from "@/cli/utils/header";
import type { InitOptions } from "./action";
import { executeInit } from "./action";

export function createInitCommand() {
  const command = new Command("init")
    .argument("[project-name]", "Name of the project to create")
    .description("Initialize a new Life.js project.")
    .helpOption("--help", "Display help for command.")
    .option("-t, --template <name>", "Template to use.", "default")
    .option("--typescript", "Use TypeScript (default).", true)
    .option("--no-typescript", "Use JavaScript instead of TypeScript.")
    .option("--git", "Initialize a git repository.", true)
    .option("--no-git", "Skip git initialization.")
    .option("--install", "Install dependencies.", true)
    .option("--no-install", "Skip dependency installation.")
    .option("-p, --package-manager <pm>", "Package manager to use.", "bun")
    .action(async (projectName: string | undefined, options: InitOptions) => {
      try {
        console.log(await generateHeader("Init"));
        executeInit(projectName, options);
      } catch (error) {
        if (!(error instanceof Error)) return;
        console.error("\x1b[31mError:\x1b[0m", error.message);
        process.exit(1);
      }
    });

  return command;
}
