import type { STTJob } from "@/models/stt/types";
import * as op from "@/shared/operation";
import { defineHandler } from "./define";

// Use STT model to transcribe incoming voice chunks
export const transcribeVoiceHandler = defineHandler({
  name: "transcribe-voice",
  mode: "stream",
  state: { sttJob: null as STTJob | null },
  onEvent: async ({ event, state, events, agent }) => {
    // On start, create the STT job and process its results chunks
    if (event.name === "start") {
      const [errGenerate, sttJob] = await agent.models.stt.generate();
      if (errGenerate) return op.failure(errGenerate);
      state.sttJob = sttJob;
      (async () => {
        for await (const chunk of sttJob.stream) {
          if (chunk.type === "content")
            events.emit({ name: "incoming-text", data: { chunk: chunk.text } });
        }
      })();
    }

    // On stop, clean up the STT job
    else if (event.name === "stop") state?.sttJob?.cancel();
    //
    // Forward incoming voice chunks to the STT model
    else if (event.name === "incoming-voice") state.sttJob?.inputVoice(event.data.chunk);

    return op.success();
  },
});
