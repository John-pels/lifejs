import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { z } from "zod";
import { createConfig } from "@/shared/config";
import * as op from "@/shared/operation";
import type { Message, ToolDefinition } from "@/shared/resources";
import { LLMBase, type LLMGenerateMessageJob } from "../base";

// Config
export const openAILLMConfig = createConfig({
  schema: z.object({
    provider: z.literal("openai"),
<<<<<<< HEAD
    apiKey: z.string().prefault(process.env.OPENAI_API_KEY as string),
    model: z.enum(["gpt-4o-mini", "gpt-4o", "gpt-5", "gpt-5-nano"]).prefault("gpt-4o"),
    temperature: z.number().min(0).max(2).prefault(1),
=======
    apiKey: z.string().default(process.env.OPENAI_API_KEY ?? ""),
    model: z.enum(["gpt-4o-mini", "gpt-4o"]).default("gpt-4o-mini"),
    temperature: z.number().min(0).max(2).default(0.5),
>>>>>>> f052a3a (refactor: refactor all models using the operation library)
  }),
  toTelemetryAttribute: (config) => {
    // Redact sensitive fields
    config.apiKey = "redacted" as never;
    return config;
  },
});

// Model
export class OpenAILLM extends LLMBase<typeof openAILLMConfig.schema> {
  readonly #client: OpenAI;

  constructor(config: z.input<typeof openAILLMConfig.schema>) {
    super(openAILLMConfig.schema, config);
    this.#client = new OpenAI({ apiKey: config.apiKey });
  }

  /**
   * Format conversion
   */

  #toOpenAIMessage(message: Message): ChatCompletionMessageParam {
    if (message.role === "user") {
      return { role: "user", content: message.content };
    }

    if (message.role === "agent") {
      return {
        role: "assistant",
        content: message.content,
        ...(message.toolsRequests?.length
          ? {
              tool_calls: message.toolsRequests?.map((request) => ({
                id: request.id,
                function: { name: request.name, arguments: JSON.stringify(request.input) },
                type: "function",
              })),
            }
          : {}),
      };
    }

    if (message.role === "system") {
      return { role: "system", content: message.content };
    }

    if (message.role === "tool-response") {
      return {
        role: "tool",
        tool_call_id: message.toolId,
        content: JSON.stringify(message.toolOutput),
      };
    }

    return null as never;
  }

  #toOpenAIMessages(messages: Message[]): ChatCompletionMessageParam[] {
    return messages.map(this.#toOpenAIMessage);
  }

  #toOpenAITool(tool: ToolDefinition): OpenAI.Chat.Completions.ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: z.toJSONSchema(tool.schema.input),
      },
    };
  }

  #toOpenAITools(tools: ToolDefinition[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map(this.#toOpenAITool);
  }

  /**
   * Generate a message with job management - returns jobId along with stream
   */
  async generateMessage(
    params: Parameters<typeof LLMBase.prototype.generateMessage>[0],
  ): Promise<op.OperationResult<LLMGenerateMessageJob>> {
    try {
      // Create a new job
      const [errJob, job] = this.createGenerateMessageJob();
      if (errJob) return op.failure(errJob);

      // Prepare tools and messages in OpenAI format
      const openaiTools = params.tools.length > 0 ? this.#toOpenAITools(params.tools) : undefined;
      const openaiMessages = this.#toOpenAIMessages(params.messages);

      // Prepare job stream
      const stream = await this.#client.chat.completions.create(
        {
          model: this.config.model,
          temperature: this.config.temperature,
          messages: openaiMessages,
          stream: true,
          ...(openaiTools?.length
            ? {
                tools: openaiTools,
                parallel_tool_calls: true,
              }
            : {}),
        },
        { signal: job.raw.abortController.signal }, // Allows the stream to be cancelled
      );

      // Start streaming in the background (don't await)
      (async () => {
        let pendingToolCalls: Record<string, { id: string; name: string; arguments: string }> = {};

        for await (const chunk of stream) {
          // Ignore chunks if job was cancelled
          if (job.raw.abortController.signal.aborted) break;

          // Extract the choice and delta (if any)
          const choice = chunk.choices[0];
          if (!choice) throw new Error("No choice");
          const delta = choice.delta;

          // Handle content tokens
          if (delta.content) {
            job.raw.receiveChunk({ type: "content", content: delta.content });
            continue;
          }

          // Handle tool calls tokens
          if (delta.tool_calls) {
            for (const toolCall of delta.tool_calls) {
              // Retrieve the tool call ID
              const id = toolCall.id ?? Object.keys(pendingToolCalls).at(-1);
              if (!id) throw new Error("No tool call ID");

              // Ensure the tool call is tracked
              if (!pendingToolCalls[id]) pendingToolCalls[id] = { id, name: "", arguments: "" };

              // Compound name tokens
              if (toolCall.function?.name) pendingToolCalls[id].name += toolCall.function.name;

              // Compound arguments tokens
              if (toolCall.function?.arguments)
                pendingToolCalls[id].arguments += toolCall.function.arguments;
            }
          }

          // Handle finish reasons
          // - Tool calls completion
          if (choice.finish_reason === "tool_calls") {
            job.raw.receiveChunk({
              type: "tools",
              tools: Object.values(pendingToolCalls).map((toolCall) => ({
                id: toolCall.id,
                name: toolCall.name,
                input: JSON.parse(toolCall.arguments || "{}"),
              })),
            });
            pendingToolCalls = {};
          }

          // - End of stream
          if (choice.finish_reason === "stop") job.raw.receiveChunk({ type: "end" });
        }
      })();

      // Return the job immediately
      return op.success(job);
    } catch (error) {
      return op.failure({ code: "Unknown",cause:error });
    }
  }

  async generateObject<T extends z.ZodObject>(params: {
    messages: Message[];
    schema: T;
  }): Promise<op.OperationResult<z.output<T>>> {
    try {
      // Prepare messages in OpenAI format
      const openaiMessages = this.#toOpenAIMessages(params.messages);

      // Generate the object with structured JSON response format
      const response = await this.#client.chat.completions.create({
        model: this.config.model,
        messages: openaiMessages,
        temperature: this.config.temperature,
        response_format: { type: "json_object" },
      });

      // Validate response structure - this is an upstream issue, not validation
      if (!response.choices?.[0]?.message?.content) {
        return op.failure({
          code: "Upstream",
          message: "Invalid response format from OpenAI API",
        });
      }

      // Parse the response - this is a validation issue
      let parsedContent: unknown;
      try {
        parsedContent = JSON.parse(response.choices[0].message.content);
      } catch (parseError) {
        return op.failure({
          code: "Validation",
          message: `Failed to parse response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        });
      }

      // Validate using schema - this is a validation issue
      const result = params.schema.safeParse(parsedContent);
      if (!result.success) {
        const issues = result.error.issues
          .map((err) => `${err.path.join(".")}: ${err.message}`)
          .join(", ");
        return op.failure({
          code: "Validation",
          message: `Schema validation failed: ${issues}`,
        });
      }

      return op.success(result.data);
    } catch (error) {
      return op.failure({
        code: "Upstream",
        message: error instanceof Error ? error.message : String(error),
        cause: error,
      });
    }
  }
}
