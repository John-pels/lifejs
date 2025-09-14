import { z } from "zod";
import { createConfig } from "@/shared/config";
import { transportBrowserConfig } from "@/transport/config/browser";

export const agentClientConfig = createConfig({
  schema: z.object({
    transport: transportBrowserConfig.schema.default({ provider: "livekit" }),
    experimental: z.object({}).default({}),
  }),
  toTelemetryAttribute: (config) => {
    return config;
  },
});
