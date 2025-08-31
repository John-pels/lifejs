import chalk from "chalk";
import type { Command, Help } from "commander";
import { generateHeader } from "./header";
import { themeChalk } from "./theme";

// Resources URLs
const docsUrl = "https://lifejs.org/docs";
const supportUrl = "https://discord.gg/U5wHjT5Ryj";

// Track when the process started
const startTime = Date.now();

/**
 * Apply consistent help formatting to any command
 */
export async function applyHelpFormatting(command: Command, showHeader: boolean): Promise<Command> {
  // Configure help text formatting
  const help = command.createHelp();
  const originalFormatHelp = help.formatHelp.bind(help);

  help.formatHelp = (cmd: Command, helper: Help) => {
    let text = originalFormatHelp(cmd, helper);

    // Swap Options and Commands sections
    // biome-ignore lint/performance/useTopLevelRegex: reason
    const match = text.match(/(Options:[\s\S]*?)(Commands:[\s\S]*?)(?=\n\n|$)/);
    if (match) text = text.replace(match[0], `${match[2]}\n${match[1]}`);

    // Remove help command line
    text = text.replace(/^ {2}help \[command\].*\n/gm, "");

    // Style section headers - bold
    text = text.replace(/^(Usage:|Options:|Commands:|Arguments:)/gm, (_match) =>
      chalk.bold(_match),
    );

    // Style command names - orange
    text = text.replace(
      /^ {2}(dev|build|start|init)\s/gm,
      (_match, c) => `  ${themeChalk.orange(c)} `,
    );

    // Style option flags - orange
    text = text.replace(/^ {2}(-[^\s]+)/gm, (_match, flag) => `  ${themeChalk.orange(flag)}`);

    // Style placeholders in gray
    text = text.replace(
      /\[(options|project-name|command|port|host|path|dir|name|pm)\]/g,
      (_match, placeholder) => themeChalk.gray.medium(`[${placeholder}]`),
    );

    return text;
  };

  command.configureHelp(help);

  // Configure error output
  command.configureOutput({
    outputError: (str, write) => write(chalk.red(str)),
  });
  command.showHelpAfterError(true);

  // Add header if requested (only for main CLI)
  if (showHeader) command.addHelpText("beforeAll", await generateHeader("CLI"));

  // Add docs and support footer
  command.addHelpText(
    "after",
    `${command.name() === "life" ? "" : "\n"}${chalk.bold("Docs:")} ${themeChalk.gray.medium(docsUrl)}

${chalk.bold("Support:")} ${themeChalk.gray.medium(supportUrl)}

${chalk.italic(themeChalk.gray.medium(`[Ran in ${chalk.bold(`${Date.now() - startTime}ms`)}]`))}\n`,
  );

  return command;
}
