import z from "zod";
import { cartesiaTTSConfig } from "./providers/cartesia";

export const ttsProviderConfig = z.discriminatedUnion("provider", [cartesiaTTSConfig]);
