import path from "node:path";
import chalk from "chalk";
import esbuild, { type BuildFailure, type PartialMessage } from "esbuild";
import z from "zod";
import { themeChalk } from "@/cli/utils/theme";
import { isLifeError } from "@/shared/error";
import type { TelemetryLog } from "@/telemetry/types";
import { telemetryBrowserScopesDefinition } from "../../scopes/browser";
import { telemetryNodeScopesDefinition } from "../../scopes/node";

const isEsbuildError = (error: Error | unknown): error is BuildFailure => {
  if (error instanceof Error && "errors" in error) {
    const errorsSchema = z.array(
      z.object({
        id: z.string().optional(),
        pluginName: z.string().optional(),
        text: z.string().optional(),
      }),
    );
    const { success } = errorsSchema.safeParse(error.errors);
    return success;
  }
  return false;
};

function formatErrorForTerminal(error: Error | unknown): string {
  let code = "";
  let message = "";
  let stack = "";
  let after = "";
  let processed = false;

  // Format LifeError
  if (isLifeError(error)) {
    code = `LifeError (${chalk.bold(error.code)})`;
    message = error.message;
    stack = error.stack ? error.stack.split("\n").slice(3).join("\n") : "";

    if (error.cause) {
      // If that's an ESBuild error, return the error as is
      if (isEsbuildError(error.cause)) return formatErrorForTerminal(error.cause);
      // Else, append the error after the unknown LifeError
      after += formatErrorForTerminal(error.cause);
    }

    processed = true;
  }

  // Format ZodError
  else if (error instanceof z.ZodError) {
    code = "ZodError";
    message = z.prettifyError(error);
    stack = error.stack
      ? (error.stack.split("at new ZodError")?.[1]?.split("\n").slice(2).join("\n") ?? "")
      : "";
    processed = true;
  }

  // Format ESBuild errors
  else if (isEsbuildError(error)) {
    const formatEsbuildMessage = (msg: PartialMessage) => {
      return (
        esbuild
          .formatMessagesSync([msg], { kind: "error", color: true })?.[0]
          ?.replace("\x1B[31m✘ \x1B[41;31m[\x1B[41;97mERROR\x1B[41;31m]\x1B[0m \x1B[1m", "")
          ?.trim() ?? ""
      );
    };
    try {
      const esbuildError = error as BuildFailure;
      const formattedMessages = esbuildError.errors.map(formatEsbuildMessage);
      message = `BuildError: ${formattedMessages.join("\n\n")}`;
      processed = true;
    } catch (_) {
      /* Ignore, that wasn't an ESBuild error */
    }
  }

  // Format other errors
  if (!processed && error instanceof Error) {
    // Try to infer the code
    if ("name" in error && typeof error.name === "string") code = error.name;
    else if ("code" in error && typeof error.code === "string") code = error.code;

    // Try to infer the message
    if ("message" in error && typeof error.message === "string") message = error.message;
    else if ("reason" in error && typeof error.reason === "string") message = error.reason;

    // Try to infer the stack
    if ("stack" in error && typeof error.stack === "string") stack = error.stack;
    if (error.stack?.trim().includes(error.message.trim()))
      stack = stack.split("\n").slice(1).join("\n");

    // If no code, message, or stack is present, use the default
    if (!code) code = "Unknown Error";
    if (!message) message = "An unknown error occurred.";
    if (!stack) stack = "";
  }

  // If a cause is present, format it as other as well
  if (error instanceof Error && error.cause) {
    after += `${formatErrorForTerminal(error.cause)}`;
  }

  return `${code}${code ? ": " : ""}${message}${message ? " " : ""}${stack ? `\n${stack}` : ""}${after ? `\n\n${after}` : ""}`;
}

export function formatLogForTerminal(log: TelemetryLog, currentDir: string = process.cwd()) {
  // Get prefix and color based on level
  let style: { prefix: string; color?: (m: string) => string };
  if (log.level === "fatal")
    style = { prefix: themeChalk.level.fatal.bold("✘"), color: themeChalk.level.fatal };
  else if (log.level === "error")
    style = { prefix: themeChalk.level.error.bold("✘"), color: themeChalk.level.error };
  else if (log.level === "warn")
    style = { prefix: themeChalk.level.warn.bold("▲"), color: themeChalk.level.warn };
  else if (log.level === "info")
    style = { prefix: themeChalk.level.info.bold("⦿"), color: themeChalk.level.info };
  else style = { prefix: themeChalk.level.debug.bold("∴"), color: themeChalk.level.debug };

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
  const errorColor = ["error", "fatal"].includes(log.level)
    ? themeChalk.level.error
    : themeChalk.level.warn;

  // Build the output (if an error is present, add it with padding)
  let output = header;
  if (error)
    output += `\n${errorColor.dim("-----")}\n${errorColor(error)}\n${errorColor.dim("-----")}`;

  // Replace all the absolute paths with relative paths in the output (if shorter)
  output = output.replace(/\/[^\s\n\r:;,()[\]{}'"<>]+/g, (match) => {
    try {
      if (path.isAbsolute(match)) {
        const relativePath = path.relative(currentDir, match);
        // Use relative path if it's shorter than the absolute path
        if (relativePath.length < match.length) return relativePath;
      }
      return match;
    } catch {
      return match;
    }
  });

  // Otherwise, just return the header
  return output;
}
