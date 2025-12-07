import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "dotenv";

// Common environment names
const ENV_NAMES = ["development", "production", "test", "staging", "preview", "ci"];

const ENV_FILE_PATTERNS = [
  /^\.env$/, // .env
  /^\.env\.local$/, // .env.local
  new RegExp(`^\\.env\\.(${ENV_NAMES.join("|")})$`), // .env.development, .env.production, etc.
  new RegExp(`^\\.env\\.(${ENV_NAMES.join("|")})\\.local$`), // .env.development.local, etc.
];

/**
 * Load environment variables from .env files in current and parent directories.
 * Supports: .env, .env.local, .env.{environment}, .env.{environment}.local
 */
export function loadEnvVars(projectDirectory: string = process.cwd()): void {
  const dirs = [
    dirname(dirname(projectDirectory)), // grandparent
    dirname(projectDirectory), // parent
    projectDirectory, // current
  ];

  const envFiles: string[] = [];

  for (const dir of dirs) {
    if (!existsSync(dir)) continue;

    try {
      const files = readdirSync(dir)
        .filter((file) => ENV_FILE_PATTERNS.some((pattern) => pattern.test(file)))
        .sort() // alphabetical order ensures .env before .env.local
        .map((file) => join(dir, file));

      envFiles.push(...files);
    } catch {
      // Skip directories we can't read
    }
  }

  if (envFiles.length > 0) config({ path: envFiles, override: true, quiet: true });
}
