import chalk from "chalk";
import { getLatestVersion } from "fast-npm-meta";
import packageJson from "../../package.json" with { type: "json" };
import { themeChalk } from "./theme";

export interface VersionInfo {
  current: string;
  latest?: string;
  hasUpdate: boolean;
}

/**
 * Check if a new version is available from npm
 */
export async function getVersion(): Promise<VersionInfo> {
  const currentVersion = packageJson.version;
  try {
    const latestVersionData = await getLatestVersion("life");
    const latestVersion = latestVersionData.version;
    return {
      current: currentVersion,
      latest: latestVersion ?? undefined,
      hasUpdate: currentVersion !== latestVersion,
    };
  } catch {
    return {
      current: currentVersion,
      hasUpdate: false,
    };
  }
}

export function formatVersion(versionInfo: VersionInfo) {
  const hasUpdate = versionInfo.hasUpdate && versionInfo.latest;
  const raw = hasUpdate ? `${versionInfo.current} (↑ ${versionInfo.latest})` : versionInfo.current;
  const output = hasUpdate
    ? `${themeChalk.gray.medium(versionInfo.current)} ${chalk.green(chalk.bold(`(↑ ${versionInfo.latest})`))}`
    : themeChalk.gray.medium(versionInfo.current);
  return { raw, output };
}
