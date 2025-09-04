import { generateHeader } from "@/cli/utils/header";
import { loadEnvVars } from "@/cli/utils/load-env-vars";

export interface InitOptions {
  template?: string;
  typescript?: boolean;
  git?: boolean;
  install?: boolean;
  packageManager?: string;
}

export const executeInit = async (projectName?: string, options: InitOptions = {}) => {
  // Print header
  console.log(await generateHeader("Init"));

  // Load environment vars
  loadEnvVars(process.cwd());

  const name = projectName || "my-life-app";

  console.log(`Creating a new Life.js project: ${name}`);
  console.log(`Template: ${options.template || "default"}`);
  console.log(`Language: ${options.typescript !== false ? "TypeScript" : "JavaScript"}`);
  console.log(`Package manager: ${options.packageManager || "bun"}`);

  // TODO: Implement project initialization
  console.log("\n⚠️  Project initialization coming soon!");
  console.log("For now, please clone the starter template from GitHub.");
};
