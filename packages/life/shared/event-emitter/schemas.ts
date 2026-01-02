import z from "zod";

export const selectorSchema = z.string().or(z.array(z.string())).or(z.literal("*"));

export const eventSchema = z.object({
  id: z.string(),
  name: z.string(),
  data: z.unknown().optional(),
});
