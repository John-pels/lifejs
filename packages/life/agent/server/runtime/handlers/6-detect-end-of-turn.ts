import * as op from "@/shared/operation";
import { defineHandler } from "./define";

/**
 * Probability threshold (0.0-1.0) that determines when the user has finished speaking.
 * If EOU model confidence >= threshold, agent responds immediately. Otherwise, waits
 * with an adaptive timeout (see min/maxTimeoutMs below).
 *
 * Tuning considerations:
 * - Too low: Agent may interrupt users mid-sentence, creating awkward overlaps
 * - Too high: Agent waits longer before responding, increasing perceived latency
 * - Default (0.6): Balanced trade-off between responsiveness and avoiding interruptions
 */
const threshold = 0.6;

/**
 * Fallback timeout (in ms) ensuring the agent eventually responds even when EOU
 * confidence stays low. Prevents the agent from waiting indefinitely if the model
 * never reaches the threshold (e.g., incomplete sentences, uncertain patterns).
 */
const minTimeoutMs = 300;

/**
 * Maximum wait time (in ms) when EOU confidence is at or near zero. As confidence
 * increases, the timeout shrinks adaptively toward minTimeoutMs using:
 * `timeout = max(minTimeoutMs, maxTimeoutMs * (1 - probability / threshold))`
 *
 * This creates natural turn-taking: high confidence = quick response, low confidence = patient waiting.
 */
const maxTimeoutMs = 5000;

export const detectEndOfTurnHandler = defineHandler({
  name: "detect-end-of-turn",
  mode: "stream",
  state: {
    userIsSpeaking: false,
    timeoutId: null as NodeJS.Timeout | null,
    lastMessageBuffer: "",
  },
  onEvent: async ({ event, state, events, context, agent }) => {
    // Helper method to check if the agent can answer
    const canAnswer = () => {
      if (state.userIsSpeaking) return false;
      if (!state.lastMessageBuffer.trim().length) return false;
      return true;
    };

    // Helper method to emit the current message buffer
    const answer = () => {
      if (state.timeoutId) clearTimeout(state.timeoutId);
      if (!canAnswer()) return;
      events.emit({ name: "continue", data: {}, urgent: true });
      state.lastMessageBuffer = "";
    };

    // Get the current context value
    const [errGet, contextValue] = context.get();
    if (errGet) return op.failure(errGet);

    // If the agent is not listening, return
    if (!contextValue.status.listening) return op.success();

    // Handle voice related events and text chunks
    if (event.name === "incoming-voice-start") state.userIsSpeaking = true;
    else if (event.name === "incoming-voice-end") state.userIsSpeaking = false;
    else if (event.name === "incoming-text") state.lastMessageBuffer += event.data.chunk;
    else return op.success();

    // Clear the timeout if it exists
    if (state.timeoutId) clearTimeout(state.timeoutId);

    // If the agent can't answer yet, continue
    if (!canAnswer()) return op.success();

    // Determine if the user has finished speaking
    const [errPredict, endOfTurnProbability] = await agent.models.eou.predict(
      contextValue.messages,
    );
    if (errPredict) return op.failure(errPredict);

    // Emit the message if the user has finished speaking
    if (endOfTurnProbability >= threshold) answer();
    // Else, set a timeout to emit the message after a delay
    else {
      state.timeoutId = setTimeout(
        answer,
        Math.max(minTimeoutMs, maxTimeoutMs * (1 - endOfTurnProbability / threshold)),
      );
    }

    return op.success();
  },
});
