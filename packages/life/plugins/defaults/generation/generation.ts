import type { AgentServer } from "@/agent/server/class";
import type { LLMGenerateMessageJob } from "@/models/llm/base";
import type { TTSGenerateJob } from "@/models/tts/base";
import { AsyncQueue } from "@/shared/async-queue";
import { newId } from "@/shared/prefixed-id";
import type { Resources, ToolRequests } from "@/shared/resources";
import type { GenerationPluginEvent } from "./orchestrator";

export type GenerationChunk =
  | { type: "content"; textChunk: string; voiceChunk?: Int16Array }
  | { type: "tool-requests"; requests: ToolRequests }
  | { type: "end" };

export type GenerationStatus = "idle" | "started" | "ended";

export type GenerationParams = {
  prefix?: string;
  needContinue?: boolean;
  preventInterruption?: boolean;
};

export class Generation {
  id = newId("generation");
  queue: AsyncQueue<GenerationChunk> = new AsyncQueue();
  status: GenerationStatus = "idle";
  params: GenerationParams = { prefix: "", needContinue: false, preventInterruption: false };

  readonly #agent: AgentServer;
  readonly #voiceEnabled: boolean;
  #llmJob: LLMGenerateMessageJob | null = null;
  #ttsJob: TTSGenerateJob | null = null;
  // biome-ignore lint/style/useReadonlyClassProperties: it is re-assigned
  #toolRequests: ToolRequests | null = null;
  readonly #statusChangeCallbacks: ((status: GenerationStatus) => void)[] = [];

  constructor(params: { agent: AgentServer; voiceEnabled: boolean }) {
    this.#agent = params.agent;
    this.#voiceEnabled = params.voiceEnabled;
  }

  onStatusChange(callback: () => void) {
    this.#statusChangeCallbacks.push(callback);
  }

  canBeInterrupted() {
    return (
      !this.params.preventInterruption && (this.status === "started" || this.queue.length() > 0)
    );
  }

  canStart() {
    return this.status === "idle" && (this.params.prefix || this.params.needContinue);
  }

  addInsertEvent(event: Extract<GenerationPluginEvent, { type: "agent.continue" | "agent.say" }>) {
    // Error if not idle, the orchestrator should not append insert events to a non-idle generation
    if (this.status !== "idle")
      throw new Error("Cannot add continue/say operation when not idle or waiting.");

    // Set the continue, prefix, and interruptions attributes
    if (event.type === "agent.continue") this.params.needContinue = true;
    else if (event.type === "agent.say") this.params.prefix += event.data.text;
    if (!this.params.preventInterruption)
      this.params.preventInterruption = event.data.preventInterruption ?? false;
  }

  async start(resources?: Resources) {
    // Throw the generation is already running, shouldn't happen
    if (this.status !== "idle") throw new Error("Cannot start generation when not idle.");

    // Set status to running
    this.status = "started";

    // Start generations jobs
    if (this.#voiceEnabled) {
      this.#ttsJob = await this.#agent.models.tts.generate();
      this.#startTTS();
    }
    this.#startLLM(resources);

    // Call the start callbacks
    for (const callback of this.#statusChangeCallbacks) callback("started");
  }

  async #startTTS() {
    if (!this.#ttsJob) throw new Error("TTS job not initialized, should not happen.");

    // Process TTS stream (queue will be consumed by the orchestrator)
    for await (const chunk of this.#ttsJob.getStream()) {
      if (chunk.type === "content")
        this.queue.push({
          type: "content",
          textChunk: chunk.textChunk,
          voiceChunk: chunk.voiceChunk,
        });
      else if (chunk.type === "end") {
        if (this.#toolRequests) {
          this.queue.push({ type: "tool-requests", requests: this.#toolRequests });
        }
        this.end();
        break;
      } else if (chunk.type === "error") console.error("TTS error", chunk);
    }
  }

  async #startLLM(resources?: Resources) {
    // If a transcribe prefix is provided, push it to the TTS job
    if (this.params.prefix) {
      if (this.#voiceEnabled) this.#ttsJob?.pushText(this.params.prefix);
      else this.queue.push({ type: "content", textChunk: this.params.prefix });
    }

    // If doesn't need to continue, end generation
    if (!this.params.needContinue) {
      if (this.#voiceEnabled) this.#ttsJob?.pushText("", true);
      else this.end();
      return;
    }

    // Errors if continue is requested but no resources are provided
    if (!resources) throw new Error("Resources are required to continue LLM generation.");

    // Start LLM generation
    this.#llmJob = await this.#agent.models.llm.generateMessage(resources);

    // Forward stream chunks to TTS
    let hasContent = false;
    for await (const chunk of this.#llmJob.getStream()) {
      // Handle error chunks
      if (chunk.type === "error") console.error("LLM error", chunk);
      // If voice is enabled, forward chunks to TTS job
      else if (this.#voiceEnabled) {
        // - Content
        if (chunk.type === "content") {
          this.#ttsJob?.pushText(chunk.content);
          hasContent = true;
        }
        // - Tools
        else if (chunk.type === "tools") {
          if (hasContent) this.#toolRequests = chunk.tools;
          else {
            this.queue.push({ type: "tool-requests", requests: chunk.tools });
            break;
          }
        }
        // - End
        else if (chunk.type === "end") {
          this.#ttsJob?.pushText("", true);
          break;
        }
      }
      // Else if text-only is required, push chunks directly to the queue
      // - Content
      else if (chunk.type === "content")
        this.queue.push({ type: "content", textChunk: chunk.content });
      // - Tools
      else if (chunk.type === "tools") {
        this.queue.push({ type: "tool-requests", requests: chunk.tools });
        this.end();
        break;
      }
      // - End
      else if (chunk.type === "end") {
        this.end();
        break;
      }
    }
  }

  // Called by the orchestrator when end chunks are consumed
  end(early = false) {
    // Cancel any ongoing LLM job
    if (this.#llmJob) this.#llmJob.cancel();

    // Cancel any ongoing TTS job
    if (this.#ttsJob) this.#ttsJob.cancel();

    // Push an end chunk and update status
    if (early) this.queue.pushFirst({ type: "end" });
    else this.queue.push({ type: "end" });

    // Push an end chunk and update status
    this.status = "ended";

    // Call the end callbacks
    for (const callback of this.#statusChangeCallbacks) callback("ended");
  }
}
