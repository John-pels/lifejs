import { preserveDirectivesPlugin } from "esbuild-plugin-preserve-directives";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["exports/**/*", "cli/index.ts", "server/agent-process/child.ts"],
  ignoreWatch: ["**/dist/**", "**/.life/**"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  external: ["typescript", "LIFE_CLIENT_BUILD_PATH", "LIFE_SERVER_BUILD_PATH"],
  splitting: true,
  keepNames: true,
  metafile: true, // improving the accuracy
  esbuildPlugins: [
    preserveDirectivesPlugin({
      directives: ["use client", "use strict"],
      include: /\.*$/,
      exclude: /node_modules/,
    }),
  ],
});
