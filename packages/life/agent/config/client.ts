import { z } from "zod";
import { transportConfigSchema } from "@/transport/config";

export const agentClientConfigSchema = z.object({
  transport: transportConfigSchema,
});
