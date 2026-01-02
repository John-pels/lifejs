import {
  type AsyncIterableStream,
  type CallWarning,
  generateObject,
  type LanguageModel,
  type ModelMessage,
  streamText,
  type TextStreamPart,
  type Tool,
  type ToolCallPart,
  type ToolSet,
} from "ai";
import type { z } from "zod";
import { AsyncQueue } from "@/shared/async-queue";
import { lifeError } from "@/shared/error";
import { newId } from "@/shared/id";
import type { Message } from "@/shared/messages";
import * as op from "@/shared/operation";
import { telemetry } from "@/telemetry/clients/node";
import { llmConfigSchema } from "./config";
import type { LLMChunk, LLMConfig, LLMJob, LLMModelConfig, LLMTool, LLMToolRequest } from "./types";

/** Max retry attempts per model before falling back to next */
const MAX_RETRIES = 3;

export class LLMProvider {
  readonly config: LLMConfig & { model: LanguageModel };

  constructor(config: LLMConfig<"input">) {
    // Parse the LLM config
    const parsedConfig = llmConfigSchema.safeParse(config);
    if (!parsedConfig.success)
      throw lifeError({
        code: "Validation",
        message: "Invalid LLM config provided.",
        cause: parsedConfig.error,
      });
    if (!parsedConfig.data.model)
      throw lifeError({
        code: "Validation",
        message: "No LLM model configured. Please provide a model in your agent config.",
      });
    this.config = parsedConfig.data as LLMConfig & { model: LanguageModel };
  }

  /**
   * Generates a streaming message response from the LLM.
   *
   * @param params - The generation parameters
   * @param params.messages - Conversation history to send to the model
   * @param params.tools - Available tools the model can call
   * @returns A tuple `[error, job]` where:
   *   - On success: `[undefined, LLMJob]` with the job containing:
   *     - `id`: Unique identifier for this generation
   *     - `stream`: Async iterable of {@link LLMChunk} (content, reasoning, tools, error, end)
   *     - `cancel`: Function to abort the stream mid-flight
   *   - On failure: `[Error, undefined]` with the error
   *
   * @example
   * ```ts
   * const [error, job] = provider.generateMessage({
   *   messages: [{ role: "user", content: "Hello" }],
   *   tools: [],
   * });
   *
   * if (error) throw error;
   *
   * for await (const chunk of job.stream) {
   *   if (chunk.type === "content") console.log(chunk.content);
   *   if (chunk.type === "end") break;
   * }
   * ```
   */
  generateMessage(params: { messages: Message[]; tools: LLMTool[] }) {
    return op.attempt(() => {
      const job = this.#createGenerateMessageJob();
      const messages = params.messages.map(this.#toAISDKMessage);
      const tools = Object.fromEntries(
        params.tools.map((tool) => [
          tool.name,
          {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            outputSchema: tool.outputSchema,
          } satisfies Tool,
        ]),
      );

      this.#runWithFallback((config) => {
        const { warnings, fullStream } = streamText({
          ...config,
          messages,
          tools,
          abortSignal: job._abortController.signal,
        });
        this.#logAISDKWarnings(warnings);
        this.#processTextStream(fullStream, job);
      });

      return job;
    });
  }

  /**
   * Generates a structured object response from the LLM based on a Zod schema.
   *
   * @param params - The generation parameters
   * @param params.messages - Conversation history to send to the model
   * @param params.schema - Zod schema defining the expected output structure
   * @returns A tuple `[error, result]` where:
   *   - On success: `[undefined, T]` with the parsed object
   *   - On failure: `[Error, undefined]` with the error
   *
   * @example
   * ```ts
   * const schema = z.object({ name: z.string(), age: z.number() });
   *
   * const [error, person] = await provider.generateObject({
   *   messages: [{ role: "user", content: "Generate a person named Alice, age 30" }],
   *   schema,
   * });
   *
   * if (error) console.error(error);
   * else console.log(person); // { name: "Alice", age: 30 }
   * ```
   */
  async generateObject<T extends z.ZodType>(params: {
    messages: Message[];
    schema: T;
  }): Promise<op.OperationResult<z.infer<T>>> {
    return await op.attempt(async () => {
      const messages = params.messages.map(this.#toAISDKMessage);
      const result = this.#runWithFallback(async (config) => {
        const { object, warnings } = await generateObject({
          ...config,
          messages,
          schema: params.schema,
        });
        this.#logAISDKWarnings(Promise.resolve(warnings));
        return object as z.infer<T>;
      });
      return await result;
    });
  }

  #createGenerateMessageJob(): LLMJob {
    const id = newId("job");
    const stream = new AsyncQueue<LLMChunk>();
    const _abortController = new AbortController();
    const cancel = () => _abortController.abort();
    return { id, stream, cancel, _abortController, ended: false };
  }

  async #processTextStream(fullStream: AsyncIterableStream<TextStreamPart<ToolSet>>, job: LLMJob) {
    // Process chunks from AI SDK stream
    try {
      const pendingToolCalls: LLMToolRequest[] = [];
      for await (const chunk of fullStream) {
        // If the job has been aborted
        if (job._abortController.signal.aborted) {
          if (!job.ended) {
            job.ended = true;
            job.stream.push({ type: "end" });
          }
          return;
        }
        // Content tokens
        if (chunk.type === "text-delta") job.stream.push({ type: "content", content: chunk.text });
        // Reasoning tokens
        else if (chunk.type === "reasoning-delta")
          job.stream.push({ type: "reasoning", content: chunk.text });
        // Tool call
        else if (chunk.type === "tool-call")
          pendingToolCalls.push({
            id: chunk.toolCallId,
            name: chunk.toolName,
            input: chunk.input,
          });
        // Error
        else if (chunk.type === "error")
          job.stream.push({
            type: "error",
            error: chunk.error instanceof Error ? chunk.error.message : String(chunk.error),
          });
        // Finish
        else if (chunk.type === "finish") {
          // Emit any accumulated tool calls
          if (pendingToolCalls.length > 0)
            job.stream.push({ type: "tools", tools: [...pendingToolCalls] });
          job.ended = true;
          job.stream.push({ type: "end" });
        }
      }
    } catch (error) {
      job.stream.push({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      job.stream.push({ type: "end" });
    }
  }

  #toAISDKMessage(message: Message): ModelMessage {
    if (message.role === "system") return { role: "system", content: message.content };
    if (message.role === "user") return { role: "user", content: message.content };
    if (message.role === "agent")
      return {
        role: "assistant",
        content: [
          { type: "text", text: message.content },
          ...(message.actions ?? []).map(
            (action) =>
              ({
                type: "tool-call",
                toolCallId: action.id,
                toolName: action.name,
                input: action.input,
              }) as ToolCallPart,
          ),
        ],
      };
    if (message.role === "action")
      return {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: message.actionId,
            toolName: message.actionName,
            output: {
              type: "content",
              value: [{ type: "text", text: JSON.stringify(message.actionOutput) }],
            },
          },
        ],
      };
    throw new Error(`Unknown message role: ${(message as Message).role}`);
  }

  /** Retries callback up to 3 times per config, then falls back to next config. Works with sync or async callbacks. */
  #runWithFallback<T>(
    fn: (config: LLMModelConfig & { model: LanguageModel }) => T | Promise<T>,
  ): T | Promise<T> {
    const configs = [this.config, ...this.config.fallbacks.filter((fb) => fb.model)];

    const tryNext = (configIdx: number, retryCount: number, lastError: unknown): T | Promise<T> => {
      const config = configs[configIdx];
      if (!config) throw lastError;

      try {
        if (!config.model) throw new Error("No model configured");
        const result = fn(config as LLMModelConfig & { model: LanguageModel });
        if (result instanceof Promise) {
          return result.catch((error) =>
            retryCount < MAX_RETRIES - 1
              ? tryNext(configIdx, retryCount + 1, error)
              : tryNext(configIdx + 1, 0, error),
          );
        }
        return result;
      } catch (error) {
        return retryCount < MAX_RETRIES - 1
          ? tryNext(configIdx, retryCount + 1, error)
          : tryNext(configIdx + 1, 0, error);
      }
    };

    return tryNext(0, 0, undefined);
  }

  #logAISDKWarnings(warnings: Promise<CallWarning[] | undefined>) {
    warnings
      .then((list) => {
        for (const warning of list ?? []) {
          if (warning.type === "unsupported-setting") {
            telemetry.log.warn({
              message: `(AI SDK) Unsupported LLM model setting '${warning.setting}': ${warning.details}`,
            });
          } else if (warning.type === "unsupported-tool") {
            telemetry.log.warn({
              message: `(AI SDK) Unsupported LLM tool '${warning.tool}': ${warning.details}`,
            });
          } else if (warning.type === "other") {
            telemetry.log.warn({
              message: `(AI SDK) Unknown warning: ${warning.message}`,
            });
          }
        }
      })
      // Warnings are best-effort, don't propagate errors
      .catch(() => void 0);
  }
}
