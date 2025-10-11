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
          include: ["**/*.test.ts"],
          exclude: [
            "**/*.browser.test.ts",
            // Temporarily exclude model tests
            "models/llm/tests/mistral.test.ts",
            "models/llm/tests/openai-compatible.test.ts",
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
