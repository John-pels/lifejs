import { FlattenMap, originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import ErrorStackParser from "error-stack-parser";
import z from "zod";
import { isLifeError } from "@/shared/error";
import type { TelemetryLog } from "@/telemetry/types";
import { telemetryBrowserScopesDefinition } from "../../scopes/browser";

const sourceMapCache = new Map<string, TraceMap | null>();

async function getSourceMap(file: string): Promise<TraceMap | null> {
  if (sourceMapCache.has(file)) return sourceMapCache.get(file) ?? null;
  try {
    const mapUrl = `${file}.map`;
    const r = await fetch(mapUrl, { credentials: "same-origin" });
    if (!r.ok) return sourceMapCache.set(file, null).get(file) ?? null;
    const json = await r.json();

    // Try TraceMap first, fall back to FlattenMap for sectioned source maps
    let map: TraceMap;
    try {
      map = new TraceMap(json);
    } catch (error) {
      // If TraceMap fails with sectioned source map error, use FlattenMap
      if (error instanceof Error && error.message.includes("sectioned source map")) {
        map = new FlattenMap(json);
      } else {
        throw error;
      }
    }

    return sourceMapCache.set(file, map).get(file) ?? null;
  } catch (error) {
    console.log("ERROR GETTING SOURCE MAP", error);
    return sourceMapCache.set(file, null).get(file) ?? null;
  }
}

/** Returns a pretty, source-mapped stack string for an Error (browser dev). */
export async function errorToPrettyStack(err: Error): Promise<string> {
  const frames = safeParse(err);
  const lines: string[] = [];

  for (const f of frames) {
    const file = f.fileName?.startsWith("async ") ? f.fileName.slice(6) : f.fileName;
    const line = f.lineNumber;
    const col = f.columnNumber;

    let ref = "<unknown>";
    if (file && line != null && col != null) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential fine here
      const map = await getSourceMap(file);
      if (map) {
        const pos = originalPositionFor(map, { line, column: col, bias: 1 });
        if (pos.source && pos.line != null && pos.column != null) {
          ref = `${pos.source}:${pos.line}:${pos.column}`;
        }
      }
      if (!ref) ref = `${file}:${line}:${col}`;
    }

    lines.push(f.functionName ? `  at ${f.functionName} (${ref})` : `  at ${ref}`);
  }
  return lines.join("\n");
}

function safeParse(err: Error) {
  try {
    return ErrorStackParser.parse(err);
  } catch {
    return [
      {
        fileName: undefined,
        lineNumber: undefined,
        columnNumber: undefined,
        functionName: err.name || "Error",
      },
    ];
  }
}

// ---
export async function formatErrorForBrowser(error: Error | unknown): Promise<string> {
  let code = "";
  let message = "";
  let stack = "";
  let after = "";
  let processed = false;

  // Format LifeError
  if (isLifeError(error)) {
    code = `LifeError (${error.code})`;
    message = error.message;
    const prettyStack = await errorToPrettyStack(error);
    stack = prettyStack;

    if (error.code === "Validation" && error.zodError) {
      after += await formatErrorForBrowser(error.zodError);
    }
    if (error.code === "Unknown" && error.error) {
      after += await formatErrorForBrowser(error.error);
    }
    processed = true;
  }

  // Format ZodError
  else if (error instanceof z.ZodError) {
    code = "ZodError";
    message = z.prettifyError(error);
    stack = await errorToPrettyStack(error);
    processed = true;
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
    if ("stack" in error && typeof error.stack === "string") {
      const prettyStack = await errorToPrettyStack(error);
      stack = prettyStack ?? "";
    }
    if (error.stack?.trim().includes(error.message.trim()))
      stack = stack.split("\n").slice(1).join("\n");

    // If no code, message, or stack is present, use the default
    if (!code) code = "Unknown Error";
    if (!message) message = "An unknown error occurred.";
    if (!stack) stack = "";
  }

  // If a cause is present, format it as other as well
  if (error instanceof Error && error.cause) {
    after += await formatErrorForBrowser(error.cause);
  }

  return `${code}${code ? ": " : ""}${message}${message ? " " : ""}${stack ? `\n${stack}` : ""}${after ? `\n\n${after}` : ""}`;
}

export async function formatLogForBrowser(log: TelemetryLog) {
  // Get prefix and color based on level
  let prefix: string;
  if (log.level === "fatal") prefix = "✘";
  else if (log.level === "error") prefix = "✘";
  else if (log.level === "warn") prefix = "▲";
  else if (log.level === "info") prefix = "⦿";
  else prefix = "→";

  // Format the log scope
  const scopeDefinition =
    telemetryBrowserScopesDefinition?.[log.scope as keyof typeof telemetryBrowserScopesDefinition];
  const scopeDisplayName =
    scopeDefinition?.displayName instanceof Function
      ? // biome-ignore lint/suspicious/noExplicitAny: fine here
        scopeDefinition.displayName(log.attributes as any)
      : scopeDefinition?.displayName;
  const scope = `[Life.js > ${scopeDisplayName ?? "Unknown"}]`;

  // Format the log message
  const message = log.message || "";

  // Build the log header with browser console CSS styling
  const header = `${prefix} ${scope}${message ? ` ${message}` : ""}`;

  // Format the log error content (if any)
  const error = await formatErrorForBrowser(log.error);

  // Build the output (if an error is present, add it with padding)
  let output = header;
  if (error)
    output += `\n-----\n${error.includes(log.message) ? error.split("\n").slice(1).join("\n") : error}`;

  // Otherwise, just return the header
  return output;
}
