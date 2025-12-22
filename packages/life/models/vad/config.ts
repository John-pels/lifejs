import z from "zod";
import { sileroVADConfig } from "./providers/base";

export const vadProviderConfig = z.discriminatedUnion("provider", [sileroVADConfig]);
