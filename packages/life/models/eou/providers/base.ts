import type { z } from "zod";
import type { Message } from "@/agent/messages";

export abstract class EOUProviderBase<ConfigSchema extends z.ZodObject> {
  protected config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  abstract predict(messages: Message[]): Promise<number> | number;
}
