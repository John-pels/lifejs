import z from "zod";
import { sileroVADConfig } from "./providers/silero";

export const vadProviderConfig = z.discriminatedUnion("provider", [sileroVADConfig]);
