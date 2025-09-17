import { z } from "zod";
import { createConfig } from "@/shared/config";
import { transportBrowserConfig } from "@/transport/config/browser";

export const agentClientConfig = createConfig({
  schema: z.object({
    transport: transportBrowserConfig.schema.prefault({ provider: "livekit" }),
    experimental: z.object().prefault({}),
  }),
  toTelemetryAttribute: (config) => {
    return config;
  },
});
