import os from "node:os";
import * as op from "@/shared/operation";

/**
 * Accurately track the CPU and memory usage of the current process.
 */
export class ProcessStats {
  #lastCpuUsage = process.cpuUsage();
  #lastSampleTime = Date.now();
  readonly #cpu = {
    usedPercent: 0,
    usedNs: 0,
  };

  constructor() {
    this.#updateCpuStats();
    const interval = setInterval(() => this.#updateCpuStats(), 1000);
    interval.unref();
  }

  #updateCpuStats(): void {
    const currentCpuUsage = process.cpuUsage();
    const currentTime = Date.now();
    const deltaTime = currentTime - this.#lastSampleTime;

    if (deltaTime > 0) {
      const deltaCpu =
        currentCpuUsage.user -
        this.#lastCpuUsage.user +
        (currentCpuUsage.system - this.#lastCpuUsage.system);
      const cpuPercent = (deltaCpu / (deltaTime * 1000)) * 100;
      this.#cpu.usedPercent = Math.min(100, Math.max(0, cpuPercent));
    }

    this.#cpu.usedNs = (currentCpuUsage.user + currentCpuUsage.system) * 1000;
    this.#lastCpuUsage = currentCpuUsage;
    this.#lastSampleTime = currentTime;
  }

  get() {
    try {
      const memoryUsed = process.memoryUsage().rss;
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      return op.success({
        cpu: this.#cpu,
        memory: {
          usedPercent: (memoryUsed / totalMemory) * 100,
          totalBytes: totalMemory,
          freeBytes: freeMemory,
          usedBytes: memoryUsed,
        },
      });
    } catch (error) {
      return op.failure({ code: "Unknown", error });
    }
  }
}
