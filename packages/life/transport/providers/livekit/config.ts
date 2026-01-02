import z from "zod";

export const livekitConfigSchema = z.object({
  provider: z.literal("livekit"),
  serverUrl: z.url().prefault(globalThis.process?.env?.LIVEKIT_SERVER_URL ?? "ws://localhost:7880"),
});
