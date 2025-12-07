import type { ChildProcess } from "node:child_process";
import type { LifeCompiler } from "@/compiler";
import type { LifeServer } from "@/server";
import type { LifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import type { MaybePromise } from "@/shared/types";
import type { TelemetryClient } from "@/telemetry/clients/base";

interface ExitTaskListeners {
  onStatusUpdate?: (status: string) => void;
  onProgressUpdate?: (progress: number) => void;
}

interface ExitStep {
  name: string;
  run: () => MaybePromise<op.OperationResult<unknown>>;
  timeout: number;
  onError?: (error: LifeError) => void;
}

export class ExitTask {
  readonly telemetry: TelemetryClient;
  readonly server: LifeServer | null;
  readonly compiler: LifeCompiler | null;
  readonly livekitProcess: ChildProcess | null;
  listeners: ExitTaskListeners;
  steps: ExitStep[] = [];
  _status = "Exiting...";
  _progress = 0;

  constructor({
    telemetry,
    server,
    compiler,
    livekitProcess,
    listeners,
  }: {
    telemetry: TelemetryClient;
    server: LifeServer | null;
    compiler: LifeCompiler | null;
    livekitProcess: ChildProcess | null;
    listeners?: ExitTaskListeners;
  }) {
    this.telemetry = telemetry;
    this.server = server;
    this.compiler = compiler;
    this.livekitProcess = livekitProcess;
    this.listeners = listeners ?? {};
  }

  setStatus(status: string) {
    this._status = status;
    this.listeners.onStatusUpdate?.(status);
  }

  setProgress(progress: number) {
    this._progress = progress;
    this.listeners.onProgressUpdate?.(progress);
  }

  registerStep({
    name,
    run,
    timeout = 5000,
    onError,
  }: {
    name: string;
    run: () => MaybePromise<op.OperationResult<unknown>>;
    timeout?: number;
    onError?: (error: LifeError) => void;
  }) {
    this.steps.push({ name, run, timeout, onError });
  }

  async runSteps() {
    const totalSteps = this.steps.length;
    let completedSteps = 0;

    await Promise.all(
      this.steps.map(async (step) => {
        try {
          this.telemetry.log.debug({ message: `Running exit step '${step.name}'.` });

          // Schedule a timeout promise
          const timeoutPromise = new Promise<op.OperationResult<unknown>>((resolve) => {
            setTimeout(() => {
              resolve(
                op.failure({
                  code: "Timeout",
                  message: `Exit step '${step.name}' timed out after ${step.timeout}ms.`,
                }),
              );
            }, step.timeout);
          });

          // Wait for the step or the timeout to resolve
          const result = await Promise.race([step.run(), timeoutPromise]);

          if (result[0]) {
            this.telemetry.log.error({
              message: `Exit step '${step.name}' failed.`,
              error: result[0],
            });
            step.onError?.(result[0]);
          } else {
            this.telemetry.log.debug({
              message: `Exit step '${step.name}' completed successfully.`,
            });
          }

          // Update progress based on completed steps
          completedSteps += 1;
          const progress = Math.round((completedSteps / totalSteps) * 100);
          this.setProgress(progress);
        } catch (error) {
          const operationError = op.failure({
            code: "Unknown",
            message: `Failed to run exit step '${step.name}'.`,
            cause: error,
          })[0];
          this.telemetry.log.error({ message: `Exit step '${step.name}' threw error.`, error });
          step.onError?.(operationError);

          // Update progress even on error
          completedSteps += 1;
          const progress = Math.round((completedSteps / totalSteps) * 100);
          this.setProgress(progress);
        }
      }),
    );
  }

  async run() {
    this.setStatus("Stopping services...");

    // Register all cleanup steps
    this.registerStep({
      name: "Stopping LiveKit server...",
      timeout: 5000,
      run: () => {
        this.livekitProcess?.kill();
        return op.success();
      },
    });

    this.registerStep({
      name: "Stopping server...",
      timeout: 10_000,
      run: async () => {
        await this.server?.stop();
        return op.success();
      },
    });

    this.registerStep({
      name: "Stopping compiler...",
      timeout: 10_000,
      run: async () => {
        await this.compiler?.stop();
        return op.success();
      },
    });

    // Run all steps in parallel
    await this.runSteps();

    this.setStatus("Done!");
    await new Promise((resolve) => setTimeout(resolve, 10));

    this.telemetry.log.debug({ message: "Exiting process..." });
    process.exit(0);
  }
}
