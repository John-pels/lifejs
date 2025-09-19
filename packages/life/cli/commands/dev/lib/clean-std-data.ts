import stripAnsi from "@/telemetry/helpers/strip-ansi";

/**
 * Cleans log output by stripping ANSI codes and replacing tab characters
 */
export const cleanStdData = (rawOutput: Buffer): string[] => {
  const text = rawOutput.toString("utf8");
  const strippedText = stripAnsi(text);
  const cleanedLines = strippedText
    .split("\n")
    .filter(Boolean)
    .map((line) => line.replaceAll("\t", " "));
  return cleanedLines;
};
