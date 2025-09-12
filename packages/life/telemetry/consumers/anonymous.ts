import type { TelemetryConsumer } from "../types";

export class AnonymousDataConsumer implements TelemetryConsumer {
  isProcessing() {
    return false;
  }
  async start(queue: Parameters<TelemetryConsumer["start"]>[0]) {
    for await (const _signal of queue) {
      // TODO: Collect anonymous usage data
    }
  }
}
