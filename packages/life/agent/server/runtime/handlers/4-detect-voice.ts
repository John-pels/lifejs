import type { VADChunk, VADJob } from "@/models/vad/types";
import { audioChunkToMs } from "@/shared/audio-chunk-to-ms";
import * as op from "@/shared/operation";
import { RollingBuffer } from "@/shared/rolling-buffer";
import type { Event } from "../../../types";
import { defineHandler } from "./define";

/**
 * VAD score threshold for detecting voice activity during speech (0.0-1.0).
 * Uses hysteresis: once voice is detected, this higher threshold must be exceeded
 * to continue considering audio as speech. This prevents flickering between
 * speech/silence states during continuous speaking.
 */
const scoreInThreshold = 0.5;

/**
 * VAD score threshold for detecting end of voice activity (0.0-1.0).
 * When voice is active, audio must fall below this lower threshold to be
 * considered silence. Lower than `scoreInThreshold` to provide hysteresis.
 */
const scoreOutThreshold = 0.25;

/**
 * Number of silent audio chunks to buffer before voice starts (default: 100 ≈ 1s).
 * These chunks are emitted when voice is detected, ensuring the first syllables
 * and word onsets are captured for better STT accuracy.
 *
 * Can slightly impact STT latency, as increases the amount of audio to be processed.
 */
const prePaddingChunks = 100;

/**
 * Number of silent chunks to append after voice ends before finalizing (default: 200 ≈ 2s).
 *
 * Most STT providers require silence padding to finalize transcription. For example,
 * Deepgram with `endpointing: 0` and `no_delay: true` still needs substantial
 * silence to return results. Too few chunks may cause the STT to hang indefinitely.
 *
 * This default (200) balances latency and stability across providers. If your STT
 * finalizes transcripts quickly, consider lowering this value. Benchmark carefully.
 */
const postPaddingChunks = 200;

/**
 * Minimum duration (in ms) of continuous voice to trigger agent interruption.
 * Uses a sliding window to accumulate voice chunks and filter out VAD false positives.
 * Only when accumulated voice duration exceeds this threshold, the agent will be interrupted.
 */
const minVoiceInterruptionMs = 50;

// Use VAD model to detect user voice activity in incoming audio chunks
export const detectVoiceHandler = defineHandler({
  name: "detect-voice",
  mode: "stream",
  state: {
    hasActivity: false,
    prePaddingBuffer: new RollingBuffer<Int16Array>(prePaddingChunks),
    postPaddingCountdown: 0,
    // Keeps track of 3x the min. interruption duration in audio chunks
    interruptBuffer: new RollingBuffer<Int16Array>((minVoiceInterruptionMs / 10) * 3),
    voiceWindow: [] as Array<{ timestamp: number; duration: number }>,
    vadJob: null as VADJob | null,
  },
  onEvent: async ({ event, state, events, context, agent }) => {
    // On start, create a VAD job and process its results chunks
    if (event.name === "start") {
      const [errDetect, vadJob] = await agent.models.vad.detect();
      if (errDetect) return op.failure(errDetect);
      state.vadJob = vadJob;
      (async () => {
        for await (const chunk of vadJob.stream) processVADChunk(chunk);
      })();
    }
    // On stop, clean up the VAD job
    else if (event.name === "stop") state?.vadJob?.cancel();
    // Forward incoming audio to VAD model
    else if (event.name === "incoming-audio") state.vadJob?.inputVoice(event.data.chunk);

    // Helper to emit a incoming voice chunks
    const emitVoiceChunk = (data: Extract<Event, { name: "incoming-voice" }>["data"]) =>
      events.emit({ name: "incoming-voice", data });

    // Helper to calculate current interrupt duration from sliding window
    const getCurrentInterruptDuration = () => {
      const now = Date.now();
      // Remove chunks older than the voice window
      const voiceWindowMs = minVoiceInterruptionMs * 2; // twice the min. interruption duration
      state.voiceWindow = state.voiceWindow.filter((c) => now - c.timestamp <= voiceWindowMs);
      // Sum up durations of remaining chunks
      return state.voiceWindow.reduce((sum, chunk) => sum + chunk.duration, 0);
    };

    // Helper to process VAD model results
    function processVADChunk(chunk: VADChunk) {
      // Check if the chunk contains voice activity
      const activityBefore = state.hasActivity;
      state.hasActivity = chunk.score > (state.hasActivity ? scoreInThreshold : scoreOutThreshold);
      const activityChanged = state.hasActivity !== activityBefore;

      // Retrieve the status from the context
      const [errGet, contextValue] = context.get();
      if (errGet) return op.failure(errGet);
      const status = contextValue.status;

      // If the agent is currently listening
      if (status.listening) {
        // If the current chunk has voice activity
        if (state.hasActivity) {
          // Reset post-padding count for the new voice session
          state.postPaddingCountdown = postPaddingChunks;
          // Emit the voice start event
          if (activityChanged && state.prePaddingBuffer.length() > 0)
            events.emit({ name: "incoming-voice-start" });
          // Emit the pre-padding chunks
          for (let i = state.prePaddingBuffer.length() - 1; i >= 0; i--) {
            const paddingChunk = state.prePaddingBuffer.get()[i];
            if (!paddingChunk) continue;
            emitVoiceChunk({
              type: "padding",
              chunk: paddingChunk,
              paddingSide: "pre",
              paddingIndex: i,
            });
          }
          state.prePaddingBuffer.empty();
          // Emit the voice chunk
          emitVoiceChunk({ type: "voice", chunk: chunk.voice });
        }
        // Else, emit the current chunk if post-padding limit is not met yet
        else if (state.postPaddingCountdown > 0) {
          emitVoiceChunk({
            type: "padding",
            chunk: chunk.voice,
            paddingSide: "post",
            paddingIndex: state.postPaddingCountdown,
          });
          state.postPaddingCountdown--;
          if (state.postPaddingCountdown === 0) events.emit({ name: "incoming-voice-end" });
        }
        // Else, add the current chunk to the pre-padding buffer
        else state.prePaddingBuffer.add(chunk.voice);
      }
      // Or if the agent wasn't listening already
      else {
        // Buffer the audio chunk
        state.interruptBuffer.add(chunk.voice);
        // If voice activity is detected, add to sliding window
        if (state.hasActivity) {
          const duration = audioChunkToMs(chunk.voice);
          state.voiceWindow.push({
            timestamp: Date.now(),
            duration,
          });
        }
        // If the interruption duration is long enough, abort and emit all accumulated voice chunks
        if (getCurrentInterruptDuration() >= minVoiceInterruptionMs) {
          events.emit({
            name: "interrupt",
            data: { reason: "The user is speaking", author: "user" },
            urgent: true,
          });
          events.emit({ name: "incoming-voice-start" });
          for (const chunk of state.interruptBuffer.get()) emitVoiceChunk({ type: "voice", chunk });
          state.interruptBuffer.empty();
          state.voiceWindow.length = 0; // Clear the sliding window
        }
      }
    }

    return op.success();
  },
});
