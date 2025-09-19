import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// Define regex at module level for better performance
const VERSION_REGEX = /version\s+(\d+\.\d+\.\d+)/;

export const checkLivekitInstall = async () => {
  try {
    const { stdout } = await execAsync("livekit-server --version");

    // Parse version from output like "livekit-server version 1.8.4"
    const versionMatch = stdout.match(VERSION_REGEX);

    if (versionMatch?.[1]) {
      return {
        installed: true,
        version: versionMatch[1],
      };
    }

    // If we got output but couldn't parse version, still consider it installed
    return {
      installed: true,
      version: "unknown",
    };
  } catch {
    // Command not found or execution failed means LiveKit is not installed
    return {
      installed: false,
      version: null,
    };
  }
};
