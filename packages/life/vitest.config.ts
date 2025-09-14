import path from "node:path";
import { defineConfig, defineProject } from "vitest/config";

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
            "@": path.resolve(__dirname, "./"),
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
            "@": path.resolve(__dirname, "./"),
          },
          conditions: ["browser"],
        },
        esbuild: { target: "es2016" }, // or "es2016"
      }),
    ],
  },
  esbuild: { target: "es2016" }, // or "es2016"
});
