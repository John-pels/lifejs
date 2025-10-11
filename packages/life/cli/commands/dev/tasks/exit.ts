import type { ChildProcess } from "node:child_process";
import type { LifeCompiler } from "@/compiler";
import type { LifeServer } from "@/server";

type ExitTaskListeners = {
  onStatusUpdate?: (status: string) => void;
  onProgressUpdate?: (progress: number) => void;
};

export class ExitTask {
  readonly server: LifeServer | null;
  readonly compiler: LifeCompiler | null;
  readonly livekitProcess: ChildProcess | null;
  listeners: ExitTaskListeners;
  _status = "Exiting...";
  _progress = 0;

  constructor({
    server,
    compiler,
    livekitProcess,
    listeners,
  }: {
    server: LifeServer | null;
    compiler: LifeCompiler | null;
    livekitProcess: ChildProcess | null;
    listeners?: ExitTaskListeners;
  }) {
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

  async run() {
    this.setStatus("Stopping LiveKit server...");
    await this.livekitProcess?.kill();
    this.setProgress(10);

    this.setStatus("Stopping server...");
    await this.server?.stop();
    this.setProgress(30);

    this.setStatus("Stopping compiler...");
    await this.compiler?.stop();
    this.setProgress(60);

    this.setStatus("Done!");
    this.setProgress(100);

    await new Promise((resolve) => setTimeout(resolve, 50));
    process.exit(0);
  }
}
