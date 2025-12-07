#!/usr/bin/env node --enable-source-maps

// Load env vars from current working directory
// This ensures env vars are available when CLI modules are loaded
import { loadEnvVars } from "./utils/load-env-vars";

loadEnvVars(process.cwd());

// Now import and run the CLI
// Using dynamic import ensures loadEnvVars runs before CLI code is loaded
import("./run").catch((error) => {
  console.error("Failed to start CLI:", error);
  process.exit(1);
});
