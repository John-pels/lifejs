import { generateHeader } from "@/cli/utils/header";
import { LifeCompiler } from "@/compiler";
import { TelemetryClient } from "@/telemetry/clients/base";

export interface BuildOptions {
  root: string;
  output?: string;
  watch?: boolean;
  optimize?: boolean;
  debug?: boolean;
}

const errorMessage = "An error occurred while starting the compiler.";

export const executeBuild = async (telemetry: TelemetryClient, options: BuildOptions) => {
  try {
    // Print header
    console.log(await generateHeader("Build"));
  
  
    // Initialize compiler
    const compiler = new LifeCompiler({
      projectDirectory: options.root,
      outputDirectory: options.output,
      watch: options.watch,
    });
  
    // Start compiler
    const [errCompiler] = await compiler.start();
    if (errCompiler) telemetry.log.error({ message: errorMessage, error: errCompiler });
  } catch (error) {
    telemetry.log.error({ message: errorMessage, error });
  }
}