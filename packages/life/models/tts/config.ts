import z from "zod";
import { cartesiaTTSConfig } from "./providers/cartesia";

export const ttsConfigSchema = z.discriminatedUnion("provider", [cartesiaTTSConfig]);
