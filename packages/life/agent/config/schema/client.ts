import { z } from "zod";
import { transportBrowserConfig } from "@/transport/config/browser";

export const clientConfigSchema = z.object({
  transport: transportBrowserConfig.schema.prefault({ provider: "livekit" }),
  experimental: z.object().prefault({}),
});
