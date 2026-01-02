import type { z } from "zod";
import type { Message } from "@/shared/messages";
import type { OperationResult } from "@/shared/operation";

export abstract class EOUProviderBase<ConfigSchema extends z.ZodObject> {
  protected config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  /**
   * Predicts the probability that the user has finished speaking (End of Utterance).
   *
   * @param messages - The conversation history
   * @returns An `OperationResult` with the probability between 0 and 1
   */
  abstract predict(messages: Message[]): Promise<OperationResult<number>>;
}
