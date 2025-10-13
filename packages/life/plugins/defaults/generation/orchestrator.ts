import { z } from "zod";
import type { AgentServer } from "@/agent/server/class";
import type {
  PluginContextHandler,
  PluginEvent,
  PluginEventsHandler,
} from "@/plugins/server/types";
import { AsyncQueue } from "@/shared/async-queue";
import type * as op from "@/shared/operation";
import { newId } from "@/shared/prefixed-id";
import type { Resources } from "@/shared/resources";
import { Generation, type GenerationChunk } from "./generation";
import type { generationPlugin } from "./server";

export type GenerationPluginEvent = PluginEvent<
  typeof generationPlugin._definition.events,
  "output"
>;
type GenerationPluginContext = z.output<typeof generationPlugin._definition.context>;

export type GenerationPluginParams = {
  agent: op.ToPublic<AgentServer>;
  events: op.ToPublic<PluginEventsHandler<typeof generationPlugin._definition.events>>;
  queue: AsyncQueue<GenerationPluginEvent>;
  context: op.ToPublic<PluginContextHandler<GenerationPluginContext, "read">>;
};

// Orchestrator
export class GenerationOrchestrator {
  readonly #generationPlugin: GenerationPluginParams;
  readonly #generationsQueue: AsyncQueue<Generation> = new AsyncQueue();
  #generations: Generation[] = [];
  #decidePromises: {
    id: string;
    event: Extract<GenerationPluginEvent, { type: "agent.decide" }>;
    promise: Promise<void>;
    cancel: () => Extract<GenerationPluginEvent, { type: "agent.decide" }>;
  }[] = [];
  readonly #generationsResourcesRequestsIds: Record<string, string> = {};
  readonly #resourcesResponses: Record<string, Resources> = {};

  constructor(params: GenerationPluginParams) {
    this.#generationPlugin = params;
  }

  async start() {
    // Start consuming generations
    this.#consumeGenerations();

    // Start processing events
    for await (const event of this.#generationPlugin.queue) {
      // If this is a generation event, process it
      if (this.#isGenerationEvent(event)) await this.#processGenerationEvent(event);
    }
  }

  #createGeneration() {
    // Create the generation
    const generation = new Generation({
      agent: this.#generationPlugin.agent,
      voiceEnabled: this.#generationPlugin.context.get().voiceEnabled,
    });
    this.#generations.push(generation);

    // On generation status change, try to update the thinking status
    generation.onStatusChange(() => {
      const runningCount = this.#generations.filter((g) => g.status === "started").length;
      // - If the agent is thinking, but no generation is running, emit thinking end
      if (this.#generationPlugin.context.get().status.thinking) {
        if (runningCount === 0)
          this.#generationPlugin.events.emit({ type: "agent.thinking-end", urgent: true });
      }
      // - Or if the agent is not thinking, but a generation is running, emit thinking start
      else if (runningCount > 0)
        this.#generationPlugin.events.emit({ type: "agent.thinking-start", urgent: true });
    });

    return generation;
  }

  async #processGenerationEvent(event: GenerationPluginEvent) {
    // Retrieve or create the first idle generation
    let generation = this.#generations.find((g) => g.status === "idle");
    if (!generation) generation = await this.#createGeneration();

    // Process the event
    if (event.type === "agent.continue") this.#processInsertEvent(generation, event);
    else if (event.type === "agent.say") this.#processInsertEvent(generation, event);
    else if (event.type === "agent.decide") this.#processDecideEvent(generation, event);
    else if (event.type === "agent.interrupt") this.#processInterruptEvent(event);
    else if (event.type === "agent.resources-response") this.#processResourcesResponseEvent(event);

    // If the generation is not ready to start yet, return
    if (!generation.canStart()) return;

    // If there are remaining generation events to process, wait
    if (this.#isQueueBusy()) return console.log("😡 QUEUE WAS BUSY");

    // If that was a continue operation, request resources
    if (event.type === "agent.continue") {
      const requestId = this.#generationPlugin.events.emit({ type: "agent.resources-request" });
      this.#generationsResourcesRequestsIds[generation.id] = requestId;
    }

    // If the generation has continue but no resources yet, wait
    if (
      generation.params.needContinue &&
      !((this.#generationsResourcesRequestsIds[generation.id] ?? "") in this.#resourcesResponses)
    )
      return;

    // Find any currently running generation
    const runningGeneration = this.#generations.find((g) => g.status !== "idle");

    if (runningGeneration) {
      // DO NOTHING FOR NOW
      // if g.status === "ended" -> g.queue.length() is equal to remaining chunks to stream
      // - If the running generation is about to end, start the next one
      // - If smooth interruption is requested, sync both generations for a smooth transition
      //   - If not possible interrupt abruptly
    }

    // Or if there is no running generation, start the generation immediately
    else {
      const resourceRequestId = this.#generationsResourcesRequestsIds[generation.id];
      const resources = resourceRequestId ? this.#resourcesResponses[resourceRequestId] : undefined;
      generation.start(resources);
      this.#generationsQueue.push(generation);
    }
  }

  #processInterruptEvent(event: Extract<GenerationPluginEvent, { type: "agent.interrupt" }>) {
    let interrupted = false;
    // Try interrupting all generations
    for (const generation of this.#generations) {
      if (generation.canBeInterrupted() || event.data.force) {
        // Schedule the early end of the generation
        generation.end(true);

        // If the generation was already partially or entirely consumed by the orchestrator
        // consider that the agent was interrupted during its speech
        if (generation.queue.totalLength() > generation.queue.length()) interrupted = true;
      }
    }

    // If at least one generation was interrupted, notify the interruption
    if (interrupted) {
      this.#generationPlugin.events.emit({
        type: "agent.interrupted",
        data: {
          reason: event.data.reason,
          forced: event.data.force ?? false,
          author: event.data.author,
        },
      });
    }
  }

  #processResourcesResponseEvent(
    event: Extract<GenerationPluginEvent, { type: "agent.resources-response" }>,
  ) {
    this.#resourcesResponses[event.data.requestId] = event.data;
  }

  #processDecideEvent(
    generation: Generation,
    event: Extract<GenerationPluginEvent, { type: "agent.decide" }>,
  ) {
    const id = newId("decide");
    this.#decidePromises.push({
      id,
      event,
      promise: (async () => {
        const result = await this.#generationPlugin.agent.models.llm.generateObject({
          messages: [
            {
              id: newId("message"),
              createdAt: Date.now(),
              lastUpdated: Date.now(),
              role: "system",
              content: `
                    # Instructions
                    You're a decision assistant helping another assistant itself directly discussing with
                    the user and interacting with the application. A new system information has been received
                    and your role is to decide whether the other assistant should react to this new information,
                    or just be passive. You'll be provided the conversation history including the new information,
                    as part of the last system messages.

                    ## Output
                    Once you've taken your decision, you'll output a 'shouldReact' boolean, indicating whether
                    that new information is worth reacting to and could help the conversation goal.

                    ## Recent conversation history
                    Here is the recent conversation history, including the new information.
                    Should the agent react to the most recent system messages?

                    ${event.data.messages
                      .map((message) => {
                        if (
                          message.role === "user" ||
                          message.role === "system" ||
                          message.role === "agent"
                        )
                          return `${message.role}: ${message.content}`;
                        else return "";
                      })
                      .join("\n")}
                    `,
            },
          ],
          schema: z.object({
            shouldContinue: z.boolean(),
          }),
        });
        if (result.success && result.data.shouldContinue && generation.status === "idle") {
          this.#generationPlugin.events.emit({
            type: "agent.continue",
            data: event.data,
            urgent: true,
          });
        }

        // Remove the promise from the list
        this.#decidePromises = this.#decidePromises.filter((decide) => decide.id !== id);
      })(),
      cancel: () => {
        this.#decidePromises = this.#decidePromises.filter((decide) => decide.id !== id);
        return event;
      },
    });
  }

  #processInsertEvent(
    generation: Generation,
    event: Extract<GenerationPluginEvent, { type: "agent.continue" | "agent.say" }>,
  ) {
    // In case an abrupt intrerupt insert is requested, try first interrupting the current generation
    if (event.data.interrupt === "abrupt")
      this.#processInterruptEvent({
        id: newId("event"),
        type: "agent.interrupt",
        data: {
          reason: "Interrupted by another operation.",
          author: "application",
        },
      });

    // - Cancel and merge ongoing decide promises
    for (const decide of this.#decidePromises) {
      decide.cancel();
      generation.addInsertEvent({
        id: newId("event"),
        type: "agent.continue",
        data: decide.event.data,
      });
    }

    // - Add the initial operation to the generation
    generation.addInsertEvent(event);

    // If a smooth interruption is requested, notify the scheduler
    return event.data.interrupt === "smooth";
  }

  #isGenerationEvent(event: GenerationPluginEvent) {
    return (
      event.type === "agent.continue" ||
      event.type === "agent.say" ||
      event.type === "agent.decide" ||
      event.type === "agent.resources-response" ||
      event.type === "agent.interrupt" ||
      event.type === "agent.speaking-end"
    );
  }

  #isQueueBusy() {
    return this.#generationPlugin.queue.some((event) => this.#isGenerationEvent(event));
  }

  async #consumeGenerations() {
    // Add a throttle to send max. 150ms of upfront chunks to the user
    // This allows keeping interruptions management on the server.
    // Note: This will have no effect if voice is disabled. Text-only chunks will be emitted immediately.
    const limiter = throttledGenerationQueue(150);

    for await (const generation of this.#generationsQueue) {
      for await (const chunk of limiter(generation.queue)) {
        // Set speaking status on first content chunk
        if (!this.#generationPlugin.context.get().status.speaking && chunk.type === "content") {
          this.#generationPlugin.events.emit({ type: "agent.speaking-start", urgent: true });
        }

        // Forward content chunks to core
        if (chunk.type === "content") {
          if (chunk.textChunk.length)
            this.#generationPlugin.events.emit({
              type: "agent.text-chunk",
              data: { textChunk: chunk.textChunk },
            });
          if (this.#generationPlugin.context.get().voiceEnabled && chunk.voiceChunk?.length)
            this.#generationPlugin.events.emit({
              type: "agent.voice-chunk",
              data: { voiceChunk: chunk.voiceChunk },
            });
        }

        // Forward tool requests to core
        else if (chunk.type === "tool-requests") {
          if (chunk.requests.length)
            this.#generationPlugin.events.emit({
              type: "agent.tool-requests",
              data: chunk.requests,
            });
        }

        // Or if this is the end of the generation
        else if (chunk.type === "end") {
          // Remove the generation from the list
          this.#generations = this.#generations.filter((g) => g.id !== generation.id);

          // If this is the last generation, notify the end of speaking
          if (
            this.#generationPlugin.context.get().status.speaking &&
            this.#generationsQueue.length() === 0
          ) {
            this.#generationPlugin.events.emit({ type: "agent.speaking-end", urgent: true });
          }

          // Move to the next generation (if any)
          break;
        }
      }
    }
  }
}

/**
 * Specialized throttling function for generation chunks that uses actual audio durations
 * instead of fixed cadence. This prevents too much audio from being buffered upfront.
 *
 * @param leadMs Maximum positive/negative lead you will allow.
 * @param sampleRate Sample rate of the audio chunks (default: 16000)
 */
function throttledGenerationQueue(leadMs = 300, sampleRate = 16_000) {
  /** Wall-clock time we pegged the *first* chunk to. */
  let anchorWallTime = Date.now();

  /** Total audio duration we have *already* forwarded in milliseconds. */
  let totalAudioDurationMs = 0;

  /** Small helper: wait `ms` milliseconds. */
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  return async function* <T extends GenerationChunk>(source: AsyncIterable<T>): AsyncIterable<T> {
    for await (const chunk of source) {
      // For content chunks, use actual audio duration
      if (chunk.type === "content" && chunk.voiceChunk) {
        // Calculate actual audio duration in milliseconds
        const chunkDurationMs = (chunk.voiceChunk.length / sampleRate) * 1000;

        // ----- 1. Compute current lead ---------------------------------------
        const wallElapsed = Date.now() - anchorWallTime;
        let lead = totalAudioDurationMs - wallElapsed; // +ahead / –behind

        // ----- 2. If we're *too far behind*, slide the anchor forward --------
        if (lead < -leadMs) {
          anchorWallTime += -lead - leadMs; // move anchor just enough
          lead = -leadMs; // now clamped to lower bound
        }

        // ----- 3. If we're *too far ahead*, pause until we're inside window --
        if (lead > leadMs) {
          await sleep(lead - leadMs); // throttle down
        }

        // ----- 4. Emit the chunk and advance counters ------------------------
        yield chunk;
        totalAudioDurationMs += chunkDurationMs;
      } else {
        // For non-content chunks (tool-requests, resources-request, end), emit immediately
        yield chunk;
      }
    }
  };
}
