import { CartesiaClient } from "@cartesia/cartesia-js";
import type { StreamingResponse } from "@cartesia/cartesia-js/api";
import type Websocket from "@cartesia/cartesia-js/wrapper/Websocket";
import { z } from "zod";
import { createConfig } from "@/shared/config";
import * as op from "@/shared/operation";
import { TTSBase, type TTSGenerateJob } from "../base";

// Config
export const cartesiaTTSConfig = createConfig({
  schema: z.object({
    provider: z.literal("cartesia"),
<<<<<<< HEAD
    apiKey: z.string().prefault(process.env.CARTESIA_API_KEY as string),
    model: z.enum(["sonic-2", "sonic-turbo", "sonic"]).prefault("sonic-2"),
=======
    apiKey: z.string().default(process.env.CARTESIA_API_KEY ?? ""),
    model: z.enum(["sonic-2", "sonic-turbo", "sonic"]).default("sonic-2"),
>>>>>>> f052a3a (refactor: refactor all models using the operation library)
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
      .default("en"),
    voiceId: z.string().default("e8e5fffb-252c-436d-b842-8879b84445b6"),
  }),
  toTelemetryAttribute: (config) => {
    // Redact sensitive fields
    config.apiKey = "redacted" as never;

    return config;
  },
});

// Model
export class CartesiaTTS extends TTSBase<typeof cartesiaTTSConfig.schema> {
  readonly #cartesia: CartesiaClient;
  readonly #socket: Websocket;
  readonly #initializedJobsIds: string[] = [];

  constructor(config: z.input<typeof cartesiaTTSConfig.schema>) {
    super(cartesiaTTSConfig.schema, config);
    this.#cartesia = new CartesiaClient({ apiKey: config.apiKey });
    this.#socket = this.#cartesia.tts.websocket({
      container: "raw",
      encoding: "pcm_s16le",
      sampleRate: 16_000,
    });
  }

  // biome-ignore lint/suspicious/useAwait: need async to match TTSBase abstract method
  async generate(): Promise<op.OperationResult<TTSGenerateJob>> {
    // Create a new generation job
    const job = this.createGenerateJob();

    // Listen to job cancellation, and properly close the socket
    job.raw.abortController.signal.addEventListener("abort", () => {
      this.#socket.socket?.send(JSON.stringify({ context_id: job.id, cancel: true }));
    });

    return op.success(job);
  }

  #handleWebSocketMessage(job: TTSGenerateJob, msgString: string): void {
    // If the job has been aborted, ignore incoming messages
    if (job.raw.abortController.signal.aborted) return;

    // Parse and forward the message chunk
    const msg = JSON.parse(msgString) as StreamingResponse;

    // Handle "content" chunks
    if (msg.type === "chunk") {
      const buf = Buffer.from(msg.data, "base64");
      const pcmBytes = new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2);
      job.raw.receiveChunk({ type: "content", voiceChunk: pcmBytes });
    }
    // Handle "end" chunks
    else if (msg.type === "done") {
      job.raw.receiveChunk({ type: "end" });
    }
    // Handle "error" chunks
    else if (msg.type === "error") {
      job.raw.receiveChunk({ type: "error", error: msg.error });
    }
  }

  protected async _onGeneratePushText(
    job: TTSGenerateJob,
    text: string,
    isLast = false,
  ): Promise<op.OperationResult<void>> {
    // Validate text input
    if (text === null || text === undefined || typeof text !== "string" || text.trim().length === 0) {
      return op.failure({
        code: "Validation",
        message: "Text must be a non-empty string",
      });
    }

    // Only set up message handlers on first send for this job
    if (!this.#initializedJobsIds.includes(job.id)) {
      this.#initializedJobsIds.push(job.id);
      
      // Wrap the socket send operation in attempt() to catch any errors
      const [sendErr, response] = await op.attempt(
        this.#socket.send({
          contextId: job.id,
          modelId: "sonic-2",
          language: this.config.language,
          voice: { mode: "id", id: this.config.voiceId },
          transcript: text,
          outputFormat: {
            container: "raw",
            encoding: "pcm_s16le",
            sampleRate: 16_000,
          },
          continue: !isLast,
          maxBufferDelayMs: 100,
        })
      );

      // If sending failed, return an Upstream error
      if (sendErr) {
        return op.failure({
          code: "Upstream",
          message: "Failed to send text",
          error: sendErr,
        });
      }

      // Set up message handler
      response.on("message", (msgString: string) => this.#handleWebSocketMessage(job, msgString));
    } else {
      // For subsequent sends, just send without setting up handlers again
      try {
        this.#socket.socket?.send(
          JSON.stringify({
            context_id: job.id,
            model_id: "sonic-2",
            language: this.config.language,
            voice: { mode: "id", id: this.config.voiceId },
            transcript: text,
            output_format: {
              container: "raw",
              encoding: "pcm_s16le",
              sample_rate: 16_000,
            },
            continue: !isLast,
          })
        );
      } catch (error) {
        return op.failure({
          code: "Upstream",
          message: "Failed to send text",
          error,
        });
      }
    }

    return op.success();
  }
}
