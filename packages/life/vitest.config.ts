import path from "node:path";
import { fileURLToPath } from "node:url";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, defineProject } from "vitest/config";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const excludedTests = ["node_modules", "dist"];

export default defineConfig({
  test: {
    projects: [
      // Node.js tests configuration
      defineProject({
        test: {
          name: "node",
          environment: "node",
          include: ["**/*.test.ts", "**/test.ts"],
          exclude: [...excludedTests, "**/*.browser.test.ts"],
          pool: "forks",
        },
        resolve: {
          alias: {
            "@": path.resolve(currentDir, "./"),
          },
        },
      }),
      // Browser tests configuration
      defineProject({
        test: {
          name: "browser",
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            screenshotFailures: false,
          },
          include: ["**/*.browser.test.ts"],
          exclude: [...excludedTests],
        },
        resolve: {
          alias: {
            "@": path.resolve(currentDir, "./"),
          },
          conditions: ["browser"],
        },
      }),
    ],
  },
});
