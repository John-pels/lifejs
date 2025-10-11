import type { z } from "zod";
import type * as op from "@/shared/operation";

export abstract class VADBase<ConfigSchema extends z.ZodObject<any, any, any>> {
  protected config: z.infer<ConfigSchema>;

  constructor(configSchema: ConfigSchema, config: Partial<z.infer<ConfigSchema>>) {
    this.config = configSchema.parse({ ...config });
  }

  // To be implemented by subclasses
  abstract checkActivity(pcm: Int16Array): Promise<op.OperationResult<number>>;
}
