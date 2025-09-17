import chalk from "chalk";
import esbuild from "esbuild";
import z from "zod";
import { isLifeError } from "@/shared/error";
import type { TelemetryLog } from "@/telemetry/types";
import { telemetryBrowserScopesDefinition } from "../scopes/browser";
import { telemetryNodeScopesDefinition } from "../scopes/node";

function formatErrorForTerminal(error: Error | unknown): string {
  let code = "";
  let message = "";
  let stack = "";
  let other = "";

  // Format LifeError
  if (isLifeError(error)) {
    console.log("IS PUBLIC", error.isPublic);
    code = `LifeError (${chalk.bold(error.code)})`;
    message = error.message;
    stack = error.stack ? error.stack.split("\n").slice(1).join("\n") : "";

    if (error.code === "Validation" && error.zodError) {
      other += formatErrorForTerminal(error.zodError);
    }
    if (error.code === "Unknown" && error.error) {
      other += formatErrorForTerminal(error.error);
    }
  }

  // Format ZodError
  else if (error instanceof z.ZodError) {
    code = "ZodError";
    message = error.message;
    stack = error.stack ?? "";
    // TODO: Use new Zod v4 formatter
  }

  // Format ESBuild errors
  else if (error instanceof Error && "errors" in error) {
    const errorsSchema = z.array(
      z.object({
        id: z.string().optional(),
        pluginName: z.string().optional(),
        text: z.string().optional(),
      }),
    );
    const { success, data } = errorsSchema.safeParse(error.errors);
    if (success) {
      try {
        const messages = esbuild.formatMessagesSync(data, { kind: "error", color: true });
        const formatted = messages
          .map((m) =>
            m.replace("\x1B[31m✘ \x1B[41;31m[\x1B[41;97mERROR\x1B[41;31m]\x1B[0m \x1B[1m", ""),
          )
          .join("\n\n");
        code = "Build Error";
        message = `\n\n${formatted}`;
      } catch (_) {
        /* Ignore, that wasn't an ESBuild error */
      }
    }
  }

  // Format other errors
  else if (error instanceof Error) {
    // Try to infer the code
    if ("name" in error && typeof error.name === "string") code = error.name;
    else if ("code" in error && typeof error.code === "string") code = error.code;

    // Try to infer the message
    if ("message" in error && typeof error.message === "string") message = error.message;
    else if ("reason" in error && typeof error.reason === "string") message = error.reason;

    // Try to infer the stack
    if ("stack" in error && typeof error.stack === "string") stack = error.stack;

    // If no code, message, or stack is present, use the default
    if (!code) code = "Unknown Error";
    if (!message) message = "An unknown error occurred.";
    if (!stack) stack = "";
  }

  // If a cause is present, format it as other as well
  if (error instanceof Error && error.cause) {
    other += `${formatErrorForTerminal(error.cause)}`;
  }

  return chalk.red(
    `${code}${code ? ": " : ""}${message}${message ? " " : ""}${stack ? `\n${stack}` : ""}${other ? `\n\n${other}` : ""}`,
  );
}

export function formatLogForTerminal(log: TelemetryLog) {
  // Get prefix and color based on level
  let style: { prefix: string; color?: (m: string) => string };
  if (log.level === "fatal") style = { prefix: chalk.bold.bgRed("✘"), color: chalk.bgRed };
  else if (log.level === "error") style = { prefix: chalk.bold.red("✘"), color: chalk.red };
  else if (log.level === "warn") style = { prefix: chalk.bold.yellow("▲"), color: chalk.yellow };
  else if (log.level === "info") style = { prefix: chalk.bold.cyan("⦿"), color: chalk.cyan };
  else style = { prefix: chalk.bold.gray("→"), color: chalk.gray };

  // Format the log scope
  const scopeDefinition =
    telemetryNodeScopesDefinition?.[log.scope as keyof typeof telemetryNodeScopesDefinition] ??
    telemetryBrowserScopesDefinition?.[log.scope as keyof typeof telemetryBrowserScopesDefinition];
  const scopeDisplayName =
    scopeDefinition?.displayName instanceof Function
      ? // biome-ignore lint/suspicious/noExplicitAny: fine here
        scopeDefinition.displayName(log.attributes as any)
      : scopeDefinition?.displayName;
  const scope = `${chalk.gray(`[${chalk.italic(scopeDisplayName ?? "Unknown")}]`)} `;

  // Format the log message
  const message = log.message || "";

  // Build the log header
  const header = `${style.prefix} ${scope}${style.color ? style.color(message) : message}`;

  // Format the log error content (if any)
  const error = formatErrorForTerminal(log.error);

  // If an error is present, add it with padding
  if (error) return `${header}\n${chalk.red.dim("-----")}\n${error}\n${chalk.red.dim("-----")}\n`;

  // Otherwise, just return the header
  return header;
}
