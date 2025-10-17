import { OpenAI } from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.js";
import { z } from "zod";
import { createConfig } from "@/shared/config";
import * as op from "@/shared/operation";
import type { Message, ToolDefinition } from "@/shared/resources";
import { LLMBase, type LLMGenerateMessageJob } from "../base";

export const xaiLLMConfig = createConfig({
  schema: z.object({
    provider: z.literal("xai"),
    apiKey: z.string().default(process.env.XAI_API_KEY ?? ""),
    model: z
      .enum([
        "grok-3",
        "grok-3-fast",
        "grok-3-mini",
        "grok-3-mini-fast",
        "grok-2-1212",
        "grok-2-vision-1212",
        "grok-beta",
        "grok-vision-beta",
      ])
      .default("grok-3-mini"),
    temperature: z.number().min(0).max(2).default(0.5),
  }),
  toTelemetryAttribute: (config) => {
    // Redact sensitive fields
    config.apiKey = "redacted" as never;

    return config;
  },
});

export class XaiLLM extends LLMBase<typeof xaiLLMConfig.schema> {
  readonly #client: OpenAI;

  constructor(config: z.input<typeof xaiLLMConfig.schema>) {
    super(xaiLLMConfig.schema, config);
    this.#client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: "https://api.x.ai/v1",
    });
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
  async generateMessage(params: {
    messages: Message[];
    tools: ToolDefinition[];
  }): Promise<op.OperationResult<LLMGenerateMessageJob>> {
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
        try {
          let pendingToolCalls: Record<string, { id: string; name: string; arguments: string }> =
            {};

          for await (const chunk of stream) {
            // Ignore chunks if job was cancelled
            if (job.raw.abortController.signal.aborted) continue;

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
            if (delta.tool_calls && delta.tool_calls.length > 0) {
              for (const toolCall of delta.tool_calls) {
                if (!toolCall) continue;

                // Retrieve the tool call ID
                const id = toolCall.id ?? Object.keys(pendingToolCalls).at(-1);
                if (!id) throw new Error("No tool call ID");

                // Ensure the tool call is tracked
                if (!pendingToolCalls[id]) {
                  pendingToolCalls[id] = { id, name: "", arguments: "" };
                }

                // Compound name and arguments tokens
                if (toolCall.function) {
                  if (toolCall.function.name) pendingToolCalls[id].name += toolCall.function.name;
                  if (toolCall.function.arguments)
                    pendingToolCalls[id].arguments += toolCall.function.arguments;
                }
              }
            }

            // Handle tool call completion
            if (chunk.choices[0]?.finish_reason === "tool_calls") {
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

            // Handle end of stream
            if (chunk.choices[0]?.finish_reason === "stop") job.raw.receiveChunk({ type: "end" });
          }
        } catch (error) {
          job.raw.receiveChunk({
            type: "error",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      })();

      // Return the job immediately
      return op.success(job);
    } catch (error) {
      return op.failure({ code: "Unknown" ,cause:error});
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
          message: "Invalid response format from X.ai API",
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
          cause: parseError,
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
      return op.failure({ code: "Unknown",cause:error });
    }
  }
}
