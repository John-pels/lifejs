import path from "node:path";
import { fileURLToPath } from "node:url";
import { InferenceSession, Tensor } from "onnxruntime-node";
import { z } from "zod";
import { createConfig } from "@/shared/config";
import * as op from "@/shared/operation";
import type { Message } from "@/shared/resources";
import { EOUBase } from "../../base";

const transformers = import("@huggingface/transformers");

// Config
export const livekitEOUConfig = createConfig({
  schema: z.object({
    provider: z.literal("livekit"),
    quantized: z.boolean().default(true),
    /**
     * Quick benchmarks have shown that Livekit models are very optimized for multi-turn
     * inferences, the most balanced value considering inference time and accuracy was
     * in the 2-5 messages range for the quantized version. Carefully benchmark the change
     * if you consider increasing / decreasing this value outside of that range.
     */
    maxMessages: z.number().default(3),
    maxTokens: z.number().default(512),
  }),
});

// Model
type PreTrainedTokenizer = InstanceType<Awaited<typeof transformers>["PreTrainedTokenizer"]>;
export class LivekitEOU extends EOUBase<typeof livekitEOUConfig.schema> {
  #_tokenizer?: PreTrainedTokenizer;
  #_session?: InferenceSession;

  constructor(config: z.input<typeof livekitEOUConfig.schema>) {
    super(livekitEOUConfig.schema, config);
  }

  // Get or create the ONNX inference session
  async #getSession(): Promise<InferenceSession> {
    if (this.#_session) return this.#_session;
    // Retrieve model path
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const modelPath = path.join(
      currentDir,
      "..",
      "models",
      "eou",
      "providers",
      "livekit",
      this.config.quantized ? "model-quantized.onnx" : "model.onnx",
    );
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
      } else if (token === agentRoleToken) {
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

  async predict(messages: Message[]): Promise<op.OperationResult<number>> {
    // Validate input - null or undefined is an Invalid error
    if (messages === null || messages === undefined) {
      return op.failure({ code: "Validation", message: "Messages must be provided" })
    }

    const [err, prob] = await op.attempt(async () => {
      // Handle empty messages
      if (!messages || messages.length === 0) {
        return op.success(0);
      }

      const session = await this.#getSession();

      // Format and tokenize the conversation
      const livekitMessages = await this.#toLivekitMessages(messages);
      if (livekitMessages.length === 0) return op.success(0);
      
      const tokens = await this.#tokenize(livekitMessages);
      if (tokens.length === 0) return op.success(0);

      // Run inference
      const outputs = await session.run({
        input_ids: new Tensor("int64", tokens, [1, tokens.length]),
      });

      // Extract and return the EOU probability
      const eouProbability = outputs.prob?.data[0];
      if (!eouProbability) return op.success(0);
      return op.success(Number(eouProbability));
    });

    if (err) return op.failure({code:'Upstream', message: 'Livekit EOU error',cause:err});
    return op.success(prob);
  }
}
