import z from "zod";
import { sileroVADConfig } from "./providers/silero";

export const vadConfigSchema = z.discriminatedUnion("provider", [sileroVADConfig]);
