import { z } from "zod";
import { createConfig } from "@/shared/config";

export const livekitConfig = createConfig({
  serverSchema: z.object({
    provider: z.literal("livekit"),
    serverUrl: z
      .string()
      .url()
      .default(process.env.LIVEKIT_SERVER_URL ?? "ws://localhost:7880"),
    apiKey: z.string().default(process.env.LIVEKIT_API_KEY ?? "devkey"),
    apiSecret: z.string().default(process.env.LIVEKIT_API_SECRET ?? "secret"),
  }),
  clientSchema: z.object({
    provider: z.literal("livekit"),
    serverUrl: z
      .string()
      .url()
      .default(process.env.LIVEKIT_SERVER_URL ?? "ws://localhost:7880"),
  }),
});
