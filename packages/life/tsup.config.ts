import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["exports/**/*", "cli/index.ts"],
  ignoreWatch: ["**/dist/**", "**/.life/**"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  treeshake: true,
  sourcemap: true,
  minify: false,
  external: ["typescript"],
  splitting: true,
  keepNames: true,
});
