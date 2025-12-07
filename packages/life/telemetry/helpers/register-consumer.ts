import { AsyncQueue } from "@/shared/async-queue";
import type { TelemetryConsumer, TelemetryConsumerList, TelemetrySignal } from "../types";

export const registerConsumer = (consumer: TelemetryConsumer, list: TelemetryConsumerList) => {
  // Create a queue for this consumer
  const queue = new AsyncQueue<TelemetrySignal>();
  list.push({ instance: consumer, queue });

  // Start the consumer with the queue
  consumer.start(queue);

  // Return a function to unregister that consumer later
  let unregistered = false;
  return () => {
    if (unregistered) return;

    // Find and remove the consumer
    const index = list.findIndex((c) => c.instance === consumer);
    if (index !== -1) {
      list[index]?.queue.stop();
      list.splice(index, 1);
      unregistered = true;
    }
  };
};
