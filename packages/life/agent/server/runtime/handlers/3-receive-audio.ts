import * as op from "@/shared/operation";
import { defineHandler } from "./define";

// Consume incoming audio chunks from the WebRTC room
export const receiveAudioHandler = defineHandler({
  name: "receive-audio",
  mode: "block",
  state: { unsubscribe: null as (() => void) | null },
  onEvent: ({ event, state, events, agent }) => {
    if (event.name === "start") {
      const [errOn, unsubscribe] = agent.transport.on("audio-chunk", (evt) =>
        events.emit({ name: "incoming-audio", data: { chunk: evt.chunk } }),
      );
      if (errOn) return op.failure(errOn);
      state.unsubscribe = unsubscribe;
    }
    // Clean up the subscription on stop
    else if (event.name === "stop") state.unsubscribe?.();
    return op.success();
  },
});
