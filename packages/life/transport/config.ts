import z from "zod";
import { livekitConfigSchema } from "./providers/livekit/config";

export const transportConfigSchema = z.discriminatedUnion("provider", [livekitConfigSchema]);
