import { generateHeader } from "@/cli/utils/header";
import type { TelemetryClient } from "@/telemetry/clients/base";

export interface InitOptions {
  template?: string;
  typescript?: boolean;
  git?: boolean;
  install?: boolean;
  packageManager?: string;
}

const errorMessage = "An error occurred while initializing the project.";

export const executeInit = async (
  telemetry: TelemetryClient,
  projectName?: string,
  options: InitOptions = {},
) => {
  try {
    // Print header
    console.log(await generateHeader("Init"));

    const name = projectName || "my-life-app";

    console.log(`Creating a new Life.js project: ${name}`);
    console.log(`Template: ${options.template || "default"}`);
    console.log(`Language: ${options.typescript !== false ? "TypeScript" : "JavaScript"}`);
    console.log(`Package manager: ${options.packageManager || "bun"}`);

    // TODO: Implement project initialization
    console.log("\n⚠️  Project initialization coming soon!");
    console.log("For now, please clone the starter template from GitHub.");
  } catch (error) {
    telemetry.log.error({ message: errorMessage, error });
  }
};
