import z from "zod";
import type { LLMJob } from "@/models/llm/types";
import { newId } from "@/shared/id";
import * as op from "@/shared/operation";
import { prepareMessageInput } from "../../../messages";
import { decidePrompt } from "../../prompts/decide";
import { defineHandler } from "./define";

/** Parses inline action input string into an object */
const parseInlineActionInput = (input: string): Record<string, unknown> | undefined => {
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
    return { value: parsed };
  } catch {
    return { value: trimmed };
  }
};

interface TextGenerationJob {
  id: string;
  started: boolean;
  stopped: boolean;
  continue: boolean;
  decide: boolean | string;
  say: string;
  preventInterruption: boolean;
  llm?: LLMJob;
}

const blankJob = (): TextGenerationJob => ({
  id: newId("job"),
  started: false,
  stopped: false,
  continue: false,
  decide: false,
  say: "",
  preventInterruption: false,
});

export const generationHandler = defineHandler({
  name: "generate-text",
  mode: "stream",
  state: {
    current: blankJob(),
    next: blankJob(),
  },
  onEvent: ({ event, state, events, context, agent }) => {
    // Helper to cancel a job
    function stopJob(job: TextGenerationJob) {
      if (job.started) {
        job.llm?.cancel();
        events.emit({ name: "stop-text-generation-job", data: { id: job.id } });
        job.stopped = true;
      }
      Object.assign(job, blankJob());
    }

    // Process 'interrupt' events
    if (event.name === "interrupt") {
      if (!state.current?.preventInterruption) stopJob(state.current);
      if (!state.next?.preventInterruption) stopJob(state.next);
      events.emit({ name: "interruption", data: event.data });
    }

    // Apply 'continue', 'say', and 'decide' requests to the current or next job
    if (event.name === "continue" || event.name === "say" || event.name === "decide") {
      const job = state.current.started ? state.current : state.next;
      if (event.name === "continue") job.continue = true;
      else if (event.name === "say") job.say += `${job.say ? "." : ""}${event.data.content}`;
      else if (event.name === "decide") job.decide = event.data.hint ?? true;

      // If the current job is not started, start it
      if (!state.current.started) runJob(state.current);
    }

    // Helper to run a job
    async function runJob(job: TextGenerationJob) {
      const id = newId("job");

      // Retrieve messages from the context
      const [errorContext, contextValue] = context.get();
      if (errorContext) return op.failure(errorContext);
      const messages = contextValue.messages;

      // Apply "decide" request
      if (job.continue) job.decide = false;
      if (job.decide) {
        const [errorHint, message] = prepareMessageInput({
          role: "system",
          content: decidePrompt(messages, typeof job.decide === "string" ? job.decide : undefined),
        });
        if (errorHint) return op.failure(errorHint);
        const [errorLLM, result] = await agent.models.llm.generateObject({
          messages: [message],
          schema: z.object({
            shouldReact: z
              .boolean()
              .describe("Whether the agent should react to the recent messages"),
          }),
        });
        if (errorLLM) return op.failure(errorLLM);
        if (result.shouldReact) job.continue = true;
      }

      // Return early if there is neither 'say' nor 'continue' requests
      if (!(job.say || job.continue) || job.stopped) return op.success();

      // Emit start of text job
      job.started = true;
      events.emit({ name: "start-text-generation-job", data: { id } });

      // Apply "say" request
      if (job.say) events.emit({ name: "outgoing-text", data: { chunk: job.say } });

      // Apply "continue" request
      if (job.continue) {
        // Compute LLM context window from memories
        const memories = Object.values(agent.memories).filter((m) => !m.options.disabled);
        const sortedMemories = memories.sort((a, b) => a.priority - b.priority);
        const messages = (await Promise.all(sortedMemories.map((m) => m.get()))).flat();

        // Compute LLM tools from actions
        const actions = Object.values(agent.actions).filter((a) => !a.options.disabled);
        const tools = actions.map((a) => a.toLLMTool());

        // Generate a new message
        const [errorLLM, jobLLM] = agent.models.llm.generateMessage({ messages, tools });
        if (errorLLM) return op.failure(errorLLM);
        job.llm = jobLLM;

        // Stream the LLM response
        (async () => {
          if (!job.llm) return;
          let fullContent = "";
          const executedInlineActions = new Set<string>();
          for await (const chunk of job.llm.stream) {
            // Stop consuming stream if the job has been stopped
            if (job.stopped) break;

            // Process text content chunks
            if (chunk.type === "content") {
              events.emit({ name: "outgoing-text", data: { chunk: chunk.content } });

              // Accumulate full content and match complete inline actions
              fullContent += chunk.content;
              const inlineActionRegex = /execute::([^(]+)\(([^)]*)\)/g;
              for (const match of fullContent.matchAll(inlineActionRegex)) {
                // Skip if this exact match was already executed
                const matchKey = `${match.index}:${match[0]}`;
                if (executedInlineActions.has(matchKey)) continue;
                executedInlineActions.add(matchKey);

                // Find and execute the action (fire-and-forget)
                const actionName = match[1]?.trim();
                const action = actions.find((a) => a.definition.name === actionName);
                if (action) {
                  const input = match[2] ? parseInlineActionInput(match[2]) : undefined;
                  action.execute(input ?? {}).then(([error, result]) => {
                    if (error) events.emit({ name: "inline-action-error", data: { name: actionName, error } });
                    else events.emit({ name: "inline-action-result", data: { name: actionName, result } });
                  });
                }
              }
            }

            // Process reasoning content chunks
            else if (chunk.type === "reasoning") {
              events.emit({ name: "outgoing-reasoning", data: { chunk: chunk.content } });
            }

            // Process tools calls chunks
            else if (chunk.type === "tools") {
              await Promise.all(
                chunk.tools.map(async (tool) => {
                  const action = actions.find((a) => a.definition.name === tool.name);
                  if (action) {
                    const [errorAction, result] = await action.execute(tool.input);
                    if (errorAction) return op.failure(errorAction);
                    events.emit({
                      name: "outgoing-tool-result",
                      data: { id: tool.id, name: tool.name, result },
                    });
                  }
                }),
              );
            }
            //
            else if (chunk.type === "end") stopJob(job);
          }
        })();
      }
    }

    // Handle continue event
    return op.success();
  },
});
