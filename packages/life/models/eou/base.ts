import type { z } from "zod";
import type { Message } from "@/shared/resources";

export abstract class EOUBase<ConfigSchema extends z.AnyZodObject> {
  protected config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  abstract predict(messages: Message[]): Promise<number> | number;
}
