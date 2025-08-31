import chalk from "chalk";
import { themeChalk } from "./theme";
import { formatVersion, getVersion } from "./version";

export async function generateHeader(name: string) {
  const nameLength = `Life.js ${name}`.length;
  const formattedVersion = formatVersion(await getVersion());
  const gap = 13;
  const padding = 1;
  const headerSeparator = chalk.gray(
    "─".repeat(nameLength + gap + formattedVersion.raw.length + padding * 2),
  );
  return `
${headerSeparator}
${" ".repeat(padding)}${themeChalk.gray.medium("Life.js")} ${themeChalk.orange(chalk.italic(name))}${" ".repeat(gap)}${formattedVersion.output}${" ".repeat(padding)}
${headerSeparator}
`;
}
