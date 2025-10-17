import path from "node:path";
import { fileURLToPath } from "node:url";
import { InferenceSession, Tensor } from "onnxruntime-node";
import { z } from "zod";
import { createConfig } from "@/shared/config";
import * as op from "@/shared/operation";
import type { Message } from "@/shared/resources";
import { EOUBase } from "../../base";

const transformers = import("@huggingface/transformers");

const MAX_TOKENS = 256; // Hardcoded in the model

// Config
export const turnSenseEOUConfig = createConfig({
  schema: z.object({
    provider: z.literal("turnsense"),
    quantized: z.boolean().default(true),
    /**
     * Quick benchmark have shown that Turnsense models are very optimized for single
     * message inferences, and their documentation shows single message inferences as
     * well. Hence why this value defaults to 1. Carefully benchmark the change if you
     * consider increasing this value.
     */
    maxMessages: z.number().default(1),
  }),
});

// Model
type PreTrainedTokenizer = InstanceType<Awaited<typeof transformers>["PreTrainedTokenizer"]>;
export class TurnSenseEOU extends EOUBase<typeof turnSenseEOUConfig.schema> {
  #_tokenizer?: PreTrainedTokenizer;
  #_session?: InferenceSession;

  constructor(config: z.input<typeof turnSenseEOUConfig.schema>) {
    super(turnSenseEOUConfig.schema, config);
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
      "turnsense",
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
    this.#_tokenizer = await AutoTokenizer.from_pretrained("latishab/turnsense");
    return this.#_tokenizer;
  }

  async #tokenize(text: string): Promise<{ tokens: bigint[]; attentionMask: bigint[] }> {
    // Tokenize the provided text
    const tokenizer = await this.#getTokenizer();
    const inputs = await tokenizer(text, {
      padding: "max_length",
      max_length: 256,
      truncation: true,
      truncation_side: "left",
      return_tensors: "pt",
    });

    // Extract the data arrays from the tokenizer output
    const inputIdsArray = Array.isArray(inputs.input_ids.data)
      ? inputs.input_ids.data
      : Array.from(inputs.input_ids.data);
    const attentionMaskArray = Array.isArray(inputs.attention_mask.data)
      ? inputs.attention_mask.data
      : Array.from(inputs.attention_mask.data);
    return { tokens: inputIdsArray, attentionMask: attentionMaskArray };
  }

  async #untokenize(tokens: bigint[]): Promise<string> {
    const tokenizer = await this.#getTokenizer();
    const text = tokenizer.decode(tokens);
    return text;
  }

  async #toTurnsenseMessages(messages: Message[]): Promise<string> {
    // Ensure last message is from user
    while (messages.length > 0 && messages.at(-1)?.role !== "user") {
      messages.pop();
    }

    // Tokenize recent messages
    const { tokens } = await this.#tokenize(
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
    if (tokens.length <= MAX_TOKENS) return this.#untokenize(tokens);

    // Compute the roles tokens
    const userRoleToken = (await this.#tokenize("<|user|>")).tokens[0] as bigint;
    const agentRoleToken = (await this.#tokenize("<|assistant|>")).tokens[0] as bigint;
    const ellipsisToken = (await this.#tokenize("...")).tokens[0] as bigint;

    // Compute the kept and rest of tokens
    tokens.reverse();
    const keptTokens = tokens.slice(0, MAX_TOKENS - 3);
    const restTokens = tokens.slice(MAX_TOKENS - 3);

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

    // Handle empty messages early
    if (!messages || messages.length === 0) {
      return op.success(0);
    }

    const [err, prob] = await op.attempt(async () => {
      const session = await this.#getSession();

      // Format and tokenize the conversation
      const turnsenseMessages = await this.#toTurnsenseMessages(messages);
      if (turnsenseMessages.length === 0) return op.success(0);
      
      const { tokens, attentionMask } = await this.#tokenize(turnsenseMessages);
      if (tokens.length === 0) return op.success(0);

      // Run inference
      const outputs = await session.run({
        input_ids: new Tensor("int64", tokens, [1, tokens.length]),
        attention_mask: new Tensor("int64", attentionMask, [1, attentionMask.length]),
      });

      // Retrieve and return the EOU probability
      const probabilities = outputs.probabilities;
      if (!probabilities?.data || probabilities.data.length < 2) return op.success(0);
      const eouProbability = probabilities.data[1];
      return typeof eouProbability === "number" ? op.success(eouProbability) : op.success(0);
    });

    if (err) return op.failure({code:'Upstream', message: 'TurnSense EOU error', error: err});
    return op.success(prob);
  }
}
