import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, defineProject } from "vitest/config";

const currentDir = path.dirname(fileURLToPath(import.meta.url));


export default defineConfig({
  test: {
    projects: [
      // Node.js tests configuration
      defineProject({
        test: {
          name: "node",
          environment: "node",
          globals: true,
          include: ["**/*.test.ts"],
          exclude: [
            "**/*.browser.test.ts",
          ],
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
          globals: true,
          browser: {
            enabled: true,
            provider: "playwright",
            headless: true,
            instances: [{ browser: "chromium" }],
            screenshotFailures: false,
          },
          include: ["**/*.browser.test.ts"],
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
