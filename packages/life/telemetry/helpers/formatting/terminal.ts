import path from "node:path";
import chalk from "chalk";
import esbuild, { type BuildFailure, type PartialMessage } from "esbuild";
import z from "zod";
import { themeChalk } from "@/cli/utils/theme";
import { isLifeError } from "@/shared/error";
import { telemetryBrowserScopesDefinition } from "@/telemetry/clients/browser";
import { telemetryNodeScopesDefinition } from "@/telemetry/clients/node";
import type { TelemetryLog } from "@/telemetry/types";

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
      // Append the error after the LifeError
      after += formatErrorForTerminal(error.cause);

      // If the cause has a stack and the error is "Unknown", hide the error stack (redundant)
      const typedCause = error.cause as { stack?: string };
      if (error.code === "Unknown" && typedCause?.stack) stack = "";
    }

    processed = true;
  }

  // Format ZodError
  else if (error instanceof z.ZodError) {
    code = "ZodError";
    message = z.prettifyError(error);
    stack = error.stack ?? "";
    if (stack.includes(" at ")) {
      stack = `   ${
        stack
          .split(" at ")
          .slice(1)
          .map((line) => ` at ${line}`)
          .join("") ?? ""
      }`;
    }
    processed = true;
  }

  // Format ESBuild errors
  else if (isEsbuildError(error)) {
    const formatEsbuildMessage = (msg: PartialMessage) =>
      esbuild
        .formatMessagesSync([msg], { kind: "error", color: true })?.[0]
        ?.replace("\x1B[31m✘ \x1B[41;31m[\x1B[41;97mERROR\x1B[41;31m]\x1B[0m \x1B[1m", "")
        ?.trim() ?? "";
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

    // Remove first line of stack if it includes the error message
    stack =
      stack
        ?.split("\n")
        ?.filter((line) => !line.includes(error.message.trim()))
        ?.join("\n") ?? "";

    // If no code, message, or stack is present, use the default
    if (!code) code = "Unknown Error";
    if (!message) message = "An unknown error occurred.";
    if (!stack) stack = "";
  }

  // If a cause is present, format it as well (unless already processed)
  // Note: LifeError already handles its cause above, so we skip it here
  if (error instanceof Error && error.cause && !isLifeError(error)) {
    after += `${formatErrorForTerminal(error.cause)}`;
  }

  // Replace all the absolute paths in stack with relative paths (if shorter)
  stack = stack.replace(/\/[^\s\n\r:;,()[\]{}'"<>]+/g, (match) => {
    try {
      if (path.isAbsolute(match)) {
        const relativePath = path.relative(process.cwd(), match);
        // Use relative path if it's shorter than the absolute path
        if (relativePath.length < match.length) return relativePath;
      }
      return match;
    } catch {
      return match;
    }
  });

  return `${code}${code ? ": " : ""}${message}${message ? " " : ""}${stack ? `\n${stack}` : ""}${after ? `\n\n${after}` : ""}`;
}

export function formatLogForTerminal(log: TelemetryLog) {
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

  // Otherwise, just return the header
  return output;
}
