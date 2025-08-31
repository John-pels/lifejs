import z from "zod";
import { createConfig } from "@/shared/config";
import { livekitConfig } from "./providers/livekit/config";

/**
 * Transport config that combines all provider configs
 * Each provider config includes its own provider discriminator field
 */
export const transportConfig = createConfig({
  serverSchema: z.discriminatedUnion("provider", [livekitConfig.serverSchema]),
  clientSchema: z.discriminatedUnion("provider", [livekitConfig.clientSchema]),
});
