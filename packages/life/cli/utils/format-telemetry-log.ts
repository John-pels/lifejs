import chalk from "chalk";
import esbuild, { type BuildFailure } from "esbuild";
import type { TelemetryLog } from "@/telemetry/types";

export async function formatTelemetryLog(log: TelemetryLog) {
  // Get symbol and color based on level

  // Format the log header
  let style: { prefix: string; color?: (m: string) => string };
  if (log.level === "fatal") style = { prefix: chalk.bold.bgRed("✘"), color: chalk.bgRed };
  else if (log.level === "error") style = { prefix: chalk.bold.red("✘"), color: chalk.red };
  else if (log.level === "warn") style = { prefix: chalk.bold.yellow("▲"), color: chalk.yellow };
  else if (log.level === "info") style = { prefix: chalk.bold.cyan("⦿"), color: chalk.cyan };
  else style = { prefix: chalk.bold.gray("→"), color: chalk.gray };
  const scope = log.scope
    ? `${chalk.gray(`[${chalk.italic(log.scope.slice(1).join("."))}]`)} `
    : "";
  const message = log.message || "";
  const header = `${style.prefix} ${scope}${style.color ? style.color(message) : message}`;

  let error = "";
  if (log.error) {
    // Format ESBuild errors
    if (log.attributes?.isEsbuild) {
      const esbuildError = log.error as BuildFailure;
      const messages = await esbuild.formatMessages(esbuildError.errors, {
        kind: "error",
        color: true,
      });
      const formatted = messages
        .map((m) =>
          m.replace("\x1B[31m✘ \x1B[41;31m[\x1B[41;97mERROR\x1B[41;31m]\x1B[0m \x1B[1m", ""),
        )
        .join("\n\n");
      error = `\n\n${formatted}`;
    }
    // Format other errors
    else {
      error = `\n\n${(log.error as Error).stack}\n\n`;
    }
  }

  return `${header}${error}`;
}
