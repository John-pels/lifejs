import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["exports/**/*", "cli/index.ts", "server/agent-process/child.ts"],
  ignoreWatch: ["**/dist/**", "**/.life/**"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  minify: false,
  external: ["typescript", "LIFE_CLIENT_BUILD_PATH", "LIFE_SERVER_BUILD_PATH"],
  splitting: true,
  keepNames: true,
});
