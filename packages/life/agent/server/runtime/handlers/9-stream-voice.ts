import * as op from "@/shared/operation";
import { defineHandler } from "./define";

// Stream agent speech to the user
export const streamVoiceHandler = defineHandler({
  name: "stream-voice",
  mode: "stream",
  onEvent: ({ event, agent }) => {
    if (event.name !== "outgoing-voice") return op.success();
    agent.transport.streamAudioChunk(event.data.chunk);
    return op.success();
  },
});
