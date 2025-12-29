import type { LLMTool } from "@/models/llm/types";
import * as op from "@/shared/operation";
import { type Message, prepareMessageInput } from "../../../messages";
import { defineHandler } from "./define";

/*
- [ ] Stream max 150ms of audio upfront
*/

export const generationHandler = defineHandler({
  name: "generate-voice",
  mode: "stream",
  state: {
    currentJob: emptyJob(),
    nextJob: emptyJob(),
  },
  onEvent: ({ event, config, state, events, models, context, definition }) => {
    if (!config.enableVoice) return op.success();

    // Listen to 'stop-text-generation-job' events
    if (event.name === "stop-text-generation-job") {
    }

    // Listen to 'start-text-generation-job' events
    else if (event.name === "start-text-generation-job") {
    }

    // Process 'interrupt' events
    if (event.name === "interrupt") {
      if (!state.currentJob?.preventInterruption) cancelJob(state.currentJob);
      if (!state.nextJob?.preventInterruption) cancelJob(state.nextJob);
      events.emit({ name: "interruption", data: event.data });
    }

    // Process 'continue', 'say', and 'decide' events
    if (event.name === "continue" || event.name === "say" || event.name === "decide") {
      // Apply the event to the current or next job
      const job = state.currentJob.started ? state.currentJob : state.nextJob;
      if (event.name === "continue") job.continue = true;
      else if (event.name === "say") job.say += `${job.say ? "." : ""}${event.data.content}`;
      else if (event.name === "decide") job.decide = event.data.messages;

      // If the current job is not started, start it
      if (!state.currentJob.started) runJob(state.currentJob);
    }

    // Helper to run a job
    async function runJob(job: GenerationJob) {
      // Initialize the TTS job (if needed)
      if (config.enableVoice) {
        const [errorTTS, jobTTS] = await models.tts.generate();
        if (errorTTS) return op.failure(errorTTS);
        job.tts = jobTTS;
      }

      // Apply "say" request
      if (job.say) {
        // - Transform to speech
        if (job.tts) job.tts.inputText(job.say);
        // - Append a new message to the context
        const [errCreateMessage, eventId] = events.emit({
          name: "add-message",
          data: { message: { role: "agent", content: job.say } },
        });
        if (errCreateMessage) return op.failure(errCreateMessage);
        const [errorWait] = await events.wait(eventId);
        if (errorWait) return op.failure(errorWait);
      }

      // Apply "decide" request
      if (job.continue) job.decide = false;
      if (job.decide) {
      }

      // Apply "continue" request
      if (job.continue) {
        // Obtain messages from the context
        const [errorContext, contextValue] = context.get();
        if (errorContext) return op.failure(errorContext);

        // Compute the memories output messages
        const memories = definition.memories.filter((memory) => !memory.options.disabled);
        const messages: Message[] = [];
        for (const memory of memories) {
          const memoryMessagesInputs =
            (typeof memory.output === "function"
              ? await memory.output({
                  messages: contextValue.messages,
                  memories: {},
                  actions: {},
                  stores: {},
                })
              : memory.output) ?? [];
          const memoryMessagesOutputs = memoryMessagesInputs
            .map((input) => {
              const [_err, message] = prepareMessageInput(input);
              if (message) return message;
              return null;
            })
            .filter((message) => message !== null);
          messages.push(...memoryMessagesOutputs);
        }

        // Transform actions to LLM tools
        const tools = definition.actions
          .filter((action) => !action.options.disabled)
          .map(
            (action) =>
              ({
                name: action.name,
                description: action.description,
                inputSchema: action.inputSchema,
                outputSchema: action.outputSchema,
                execute: (input) =>
                  action.execute({ input, actions: {}, memories: {}, stores: {} }),
              }) satisfies LLMTool,
          );

        // Generate a new message
        const [errorLLM, jobLLM] = await models.llm.generateMessage({ messages, tools });
        if (errorLLM) return op.failure(errorLLM);
        job.llm = jobLLM;
      }

      (async () => {
        if (!job.llm) return;
        for await (const chunk of job.llm.stream) {
          if (chunk.type === "content") {
            if (config.enableVoice && job.tts) job.tts.inputText(chunk.content);
            events.emit({ name: "outgoing-text", data: { chunk: chunk.content } });
          }
        }
      })();
    }

    // Handle continue event
    return op.success();
  },
});

(async () => {
  if (!job.tts) return;
  for await (const chunk of job.tts.stream) {
    if (chunk.type === "content")
      events.emit({ name: "outgoing-voice", data: { chunk: chunk.voice } });
  }
})();
