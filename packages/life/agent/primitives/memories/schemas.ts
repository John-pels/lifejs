import z from "zod";

export const memoryPositionSchema = z.object({
  section: z.enum(["top", "bottom"]),
  align: z.enum(["start", "end"]),
});
