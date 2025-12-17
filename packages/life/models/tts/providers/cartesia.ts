import { CartesiaClient } from "@cartesia/cartesia-js";
import type { StreamingResponse } from "@cartesia/cartesia-js/api";
import type Websocket from "@cartesia/cartesia-js/wrapper/Websocket";
import { z } from "zod";
import * as op from "@/shared/operation";
import { TTSProviderBase } from "../base";
import type { TTSJob } from "../types";

// Config
export const cartesiaTTSConfig = z.object({
  provider: z.literal("cartesia"),
  apiKey: z.string().prefault(process.env.CARTESIA_API_KEY as string),
  model: z.enum(["sonic-2", "sonic-turbo", "sonic", "sonic-3"]).prefault("sonic-3"),
  language: z
    .enum([
      "en",
      "fr",
      "de",
      "es",
      "pt",
      "zh",
      "ja",
      "hi",
      "it",
      "ko",
      "nl",
      "pl",
      "ru",
      "sv",
      "tr",
    ])
    .prefault("en"),
  voiceId: z.string().prefault("f9836c6e-a0bd-460e-9d3c-f7299fa60f94"),
});

// Model
export class CartesiaTTS extends TTSProviderBase<typeof cartesiaTTSConfig> {
  readonly #cartesia: CartesiaClient;
  readonly #socket: Websocket;
  readonly #initializedJobsIds: string[] = [];

  constructor(config: z.input<typeof cartesiaTTSConfig>) {
    super(cartesiaTTSConfig, config);
    this.#cartesia = new CartesiaClient({ apiKey: this.config.apiKey });
    this.#socket = this.#cartesia.tts.websocket({
      container: "raw",
      encoding: "pcm_s16le",
      sampleRate: 16_000,
    });
  }

  async generate(): Promise<op.OperationResult<TTSJob>> {
    // biome-ignore lint/suspicious/useAwait: needed to match TTSBase abstract method signature
    return await op.attempt(async () => {
      const job = this.createGenerateJob();

      // Properly close the socket when the job is cancelled
      job._abortController.signal.addEventListener("abort", () => {
        this.#socket.socket?.send(JSON.stringify({ context_id: job.id, cancel: true }));
      });

      return job;
    });
  }

  #handleWebSocketMessage(job: TTSJob, msgString: string): void {
    // If the job has been aborted, ignore incoming messages
    if (job._abortController.signal.aborted) return;

    // Parse and forward the message chunk
    const msg = JSON.parse(msgString) as StreamingResponse;

    // Handle "content" chunks
    if (msg.type === "chunk") {
      const buf = Buffer.from(msg.data, "base64");
      const pcmBytes = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
      job._receiveVoiceChunk({ type: "content", voiceChunk: pcmBytes });
    }
    // Handle "end" chunks
    else if (msg.type === "done") job._receiveVoiceChunk({ type: "end" });
    // Handle "error" chunks
    else if (msg.type === "error") job._receiveVoiceChunk({ type: "error", error: msg.error });
  }

  // biome-ignore lint/suspicious/useAwait: needed to match TTSBase abstract method signature
  protected async receiveText(job: TTSJob, text: string, isLast = false) {
    // Cartesia doesn't support empty text chunks if not the last chunk
    if (!(text.length || isLast)) return;

    // Forward the text to the Cartesia API
    const response = this.#socket.send({
      contextId: job.id,
      modelId: this.config.model,
      language: this.config.language,
      voice: { mode: "id", id: this.config.voiceId },
      speed: "normal",
      transcript: text,
      outputFormat: {
        container: "raw",
        encoding: "pcm_s16le",
        sampleRate: 16_000,
      },
      continue: !isLast,
      maxBufferDelayMs: 100,
    });

    if (!this.#initializedJobsIds.includes(job.id)) {
      this.#initializedJobsIds.push(job.id);
      response
        .then((ws) => {
          ws.on("message", (msgString: string) => this.#handleWebSocketMessage(job, msgString));
        })
        .catch((error) => {
          job._receiveVoiceChunk({ type: "error", error: error.message });
        });
    }
  }
}
