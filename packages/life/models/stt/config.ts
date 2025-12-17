import z from "zod";
import { deepgramSTTConfig } from "./providers/deepgram";

export const sttConfigSchema = z.discriminatedUnion("provider", [deepgramSTTConfig]);
