import { Mistral } from "@mistralai/mistralai";
import type {
  AssistantMessage,
  SystemMessage,
  Tool,
  ToolMessage,
  UserMessage,
} from "@mistralai/mistralai/models/components";
import { z } from "zod";
import { createConfig } from "@/shared/config";
import type { Message, ToolDefinition } from "@/shared/resources";
import { LLMBase, type LLMGenerateMessageJob, type LLMObjectGenerationChunk } from "../base";

// Define Mistral-specific message types with required role properties
type MistralUserMessage = UserMessage & { role: "user" };
type MistralAssistantMessage = AssistantMessage & { role: "assistant" };
type MistralSystemMessage = SystemMessage & { role: "system" };
type MistralToolMessage = ToolMessage & { role: "tool" };
type MistralMessage =
  | MistralUserMessage
  | MistralAssistantMessage
  | MistralSystemMessage
  | MistralToolMessage;

// Config
export const mistralLLMConfig = createConfig({
  schema: z.object({
    provider: z.literal("mistral"),
    apiKey: z.string().prefault(process.env.MISTRAL_API_KEY ?? ""),
    model: z
      .enum([
        "mistral-large-latest",
        "mistral-large-2411",
        "mistral-large-2407",
        "mistral-small-latest",
        "mistral-small-2501",
        "mistral-small-2503",
        "mistral-medium-latest",
        "mistral-medium-2505",
        "pixtral-large-latest",
        "pixtral-large-2411",
        "codestral-latest",
        "codestral-2501",
        "codestral-2405",
        "ministral-3b-latest",
        "ministral-8b-latest",
        "open-mistral-7b",
        "open-mixtral-8x7b",
        "open-mixtral-8x22b",
      ])
      .prefault("mistral-small-latest"),
    temperature: z.number().min(0).max(1).prefault(0.5),
  }),
  toTelemetryAttribute: (config) => {
    // Redact sensitive fields
    config.apiKey = "redacted" as never;

    return config;
  },
});

// Model
export class MistralLLM extends LLMBase<typeof mistralLLMConfig.schema> {
  readonly #client: Mistral;

  constructor(config: z.input<typeof mistralLLMConfig.schema>) {
    super(mistralLLMConfig.schema, config);
    if (!config.apiKey)
      throw new Error(
        "MISTRAL_API_KEY environment variable or config.apiKey must be provided to use this model.",
      );
    this.#client = new Mistral({ apiKey: config.apiKey });
  }

  /**
   * Format conversion
   */

  #toMistralMessage(message: Message): MistralMessage {
    if (message.role === "user")
      return {
        role: "user",
        content: message.content,
      };

    if (message.role === "agent")
      return {
        role: "assistant",
        content: message.content,
        toolCalls: message.toolsRequests?.map((request) => ({
          type: "function",
          id: request.id,
          function: {
            name: request.name,
            arguments: JSON.stringify(request.input),
          },
        })),
      };

    if (message.role === "system")
      return {
        role: "system",
        content: message.content,
      };

    if (message.role === "tool-response")
      return {
        role: "tool",
        toolCallId: message.toolId,
        content: JSON.stringify(message.toolOutput),
      };

    return null as never;
  }

  #toMistralMessages(messages: Message[]): MistralMessage[] {
    return messages.map(this.#toMistralMessage.bind(this));
  }

  #toMistralTool(tool: ToolDefinition): Tool {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: z.toJSONSchema(tool.schema.input),
      },
    };
  }

  #toMistralTools(tools: ToolDefinition[]) {
    return tools.map(this.#toMistralTool);
  }

  /**
   * Generate a message with job management - returns jobId along with stream
   */
  async generateMessage(
    params: Parameters<typeof LLMBase.prototype.generateMessage>[0],
  ): Promise<LLMGenerateMessageJob> {
    // Create a new job
    const job = this.createGenerateMessageJob();

    // Prepare tools and messages in Mistral format
    const mistralTools = params.tools.length > 0 ? this.#toMistralTools(params.tools) : undefined;
    const mistralMessages = this.#toMistralMessages(params.messages);

    try {
      // Create the stream
      const stream = await this.#client.chat.stream({
        model: this.config.model,
        temperature: this.config.temperature,
        messages: mistralMessages,
        ...(mistralTools?.length ? { tools: mistralTools } : {}),
      });

      // Process the stream
      (async () => {
        let pendingToolCalls: Record<
          string,
          {
            id: string;
            name: string;
            arguments: string;
          }
        > = {};

        try {
          for await (const chunk of stream) {
            // Ignore chunks if job was cancelled
            if (job.raw.abortController.signal.aborted) break;

            // Extract the choice and delta (if any)
            const choice = chunk.data.choices[0];
            if (!choice) throw new Error("No choice");
            const delta = choice.delta;

            // Handle content tokens
            if (delta.content) {
              const content = delta.content;
              const contentString = typeof content === "string" ? content : JSON.stringify(content);
              job.raw.receiveChunk({
                type: "content",
                content: contentString,
              });
            }

            // Handle tool calls tokens
            const toolCalls = delta.toolCalls;
            if (toolCalls) {
              for (const toolCall of toolCalls) {
                // Retrieve the tool call ID
                const id = toolCall.id ?? Object.keys(pendingToolCalls).at(-1);
                if (!id) throw new Error("No tool call ID");

                // Ensure the tool call is tracked
                if (!pendingToolCalls[id]) {
                  pendingToolCalls[id] = { id, name: "", arguments: "" };
                }

                // Compound name tokens
                if (toolCall.function?.name) {
                  pendingToolCalls[id].name += toolCall.function.name;
                }

                // Compound arguments tokens
                if (toolCall.function?.arguments) {
                  pendingToolCalls[id].arguments += toolCall.function.arguments;
                }
              }
            }

            // Handle finish reasons
            // - Tool calls completion
            if (choice.finishReason === "tool_calls") {
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
            if (choice.finishReason === "stop") job.raw.receiveChunk({ type: "end" });
          }
        } catch (error) {
          job.raw.receiveChunk({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      })();

      // Return the job
      return job;
    } catch (error) {
      job.raw.receiveChunk({
        type: "error",
        error: error instanceof Error ? error.message : "Failed to create stream",
      });
      return job;
    }
  }

  async generateObject<T extends z.ZodObject>(params: {
    messages: Message[];
    schema: T;
  }): Promise<LLMObjectGenerationChunk<T>> {
    try {
      // Prepare messages in Mistral format
      const mistralMessages = this.#toMistralMessages(params.messages);

      // Prepare JSON schema
      const jsonSchema = z.toJSONSchema(params.schema);

      // Generate the object using schema-enforced parse method
      // This uses Mistral's built-in schema validation with the Zod schema
      const response = await this.#client.chat.complete({
        model: this.config.model,
        messages: mistralMessages,
        temperature: this.config.temperature,

        responseFormat: {
          type: "json_schema",
          jsonSchema: { name: "avc", schemaDefinition: jsonSchema },
        },
      });

      // Extract parsed content from response - already validated by Mistral API
      const data = JSON.parse((response.choices?.[0]?.message?.content as string) || "{}");

      // Return the validated object (no additional validation needed)
      return { success: true, data };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate object",
      };
    }
  }
}
