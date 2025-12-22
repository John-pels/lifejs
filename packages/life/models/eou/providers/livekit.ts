import { InferenceSession, Tensor } from "onnxruntime-node";
import { z } from "zod";
import type { Message } from "@/agent/messages";
import { lifeError } from "@/shared/error";
import * as op from "@/shared/operation";
import { RemoteFile } from "@/shared/remote-file";
import { EOUProviderBase } from "./base";

// Lazy import to avoid native module issues with process forking
const transformers = import("@huggingface/transformers");

// Config
export const livekitEOUConfig = z.object({
  provider: z.literal("livekit"),
  quantized: z.boolean().prefault(true),
  /**
   * Quick benchmarks have shown that Livekit models are very optimized for multi-turn
   * inferences, the most balanced value considering inference time and accuracy was
   * in the 2-5 messages range for the quantized version. Carefully benchmark the change
   * if you consider increasing / decreasing this value outside of that range.
   */
  maxMessages: z.number().prefault(3),
  maxTokens: z.number().prefault(512),
});

// Model
type PreTrainedTokenizer = InstanceType<Awaited<typeof transformers>["PreTrainedTokenizer"]>;
export class LivekitEOU extends EOUProviderBase<typeof livekitEOUConfig> {
  #_tokenizer?: PreTrainedTokenizer;
  #_session?: InferenceSession;

  constructor(config: z.input<typeof livekitEOUConfig>) {
    super(livekitEOUConfig, config);
  }

  // Get or create the ONNX inference session
  async #getSession(): Promise<InferenceSession> {
    if (this.#_session) return this.#_session;
    // Download model if needed
    const remotePath = this.config.quantized ? "eou-livekit-quantized.onnx" : "eou-livekit.onnx";
    const model = new RemoteFile({ name: "LiveKit EOU", remotePath });
    const [error, modelPath] = await model.getLocalPath();
    if (error) throw error;
    this.#_session = await InferenceSession.create(modelPath, {
      interOpNumThreads: 1,
      intraOpNumThreads: 1,
      executionMode: "sequential",
    });
    return this.#_session;
  }

  async #getTokenizer(): Promise<PreTrainedTokenizer> {
    if (this.#_tokenizer) return this.#_tokenizer;
    const { AutoTokenizer } = await transformers;
    this.#_tokenizer = await AutoTokenizer.from_pretrained("livekit/turn-detector", {
      revision: "v1.2.2-en",
    });
    return this.#_tokenizer;
  }

  async #tokenize(text: string): Promise<bigint[]> {
    // Tokenize the provided text
    const tokenizer = await this.#getTokenizer();
    const inputs = await tokenizer(text, {
      add_special_tokens: false,
      truncation: false,
      return_tensors: "np",
    });

    // Extract tokens
    const tokens: bigint[] = Array.isArray(inputs.input_ids.data)
      ? inputs.input_ids.data
      : Array.from(inputs.input_ids.data);
    return tokens;
  }

  async #untokenize(tokens: bigint[]): Promise<string> {
    const tokenizer = await this.#getTokenizer();
    const text = tokenizer.decode(tokens);
    return text;
  }

  async #toLivekitMessages(messages: Message[]): Promise<string> {
    // Ensure last message is from user
    while (messages.length > 0 && messages.at(-1)?.role !== "user") {
      messages.pop();
    }

    // Tokenize recent messages
    const tokens = await this.#tokenize(
      messages
        .filter((m) => m.role === "user" || m.role === "agent")
        .slice(-this.config.maxMessages)
        .map(
          (m) =>
            `${m.role === "user" ? "<|user|>" : "<|assistant|>"} ${m.content.trim()} <|im_end|>`,
        )
        .join(""),
    );

    // Remove the end token
    tokens.pop();

    // If the tokens are less than the max tokens, return them directly
    if (tokens.length <= this.config.maxTokens) return this.#untokenize(tokens);

    // Compute the roles tokens
    const userRoleToken = (await this.#tokenize("<|user|>"))[0] as bigint;
    const agentRoleToken = (await this.#tokenize("<|assistant|>"))[0] as bigint;
    const ellipsisToken = (await this.#tokenize("..."))[0] as bigint;

    // Compute the kept and rest of tokens
    tokens.reverse();
    const keptTokens = tokens.slice(0, this.config.maxTokens - 3);
    const restTokens = tokens.slice(this.config.maxTokens - 3);

    // Append the ellipsis token to the kept tokens
    keptTokens.push(ellipsisToken);

    // Find the role of the truncated message
    let truncatedMessageRole: "user" | "agent" | undefined;
    for (const token of restTokens) {
      if (token === userRoleToken) {
        truncatedMessageRole = "user";
        break;
      }
      if (token === agentRoleToken) {
        truncatedMessageRole = "agent";
        break;
      }
    }
    if (!truncatedMessageRole) throw new Error("Failed to find the role. Shouldn't happen.");

    // Append the role token to the kept tokens
    keptTokens.push(truncatedMessageRole === "user" ? userRoleToken : agentRoleToken);

    // Reverse and return the tokens
    return this.#untokenize(keptTokens.reverse());
  }

  async predict(messages: Message[]) {
    // Handle empty messages
    if (!messages || messages.length === 0) return op.success(0);

    // Use op.attempt to handle errors and return OperationResult
    return await op.attempt(async () => {
      const session = await this.#getSession();

      // Format and tokenize the conversation
      const livekitMessages = await this.#toLivekitMessages(messages);
      if (livekitMessages.length === 0) return 0;

      const tokens = await this.#tokenize(livekitMessages);
      if (tokens.length === 0) return 0;

      // Run inference
      const outputs = await session.run({
        input_ids: new Tensor("int64", tokens, [1, tokens.length]),
      });

      // Extract and return the EOU probability
      const eouProbability = outputs.prob?.data[0];
      if (!eouProbability) {
        throw lifeError({
          code: "Upstream",
          message: "Livekit EOU model returned no probability output.",
        });
      }

      return Number(eouProbability);
    });
  }
}
