import { z } from "zod";

export const GenerateCalendarSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Must be YYYY-MM with valid month"),
  topicAreas: z.array(z.string().min(1)).min(1).max(10),
  postsPerWeek: z.number().int().min(1).max(7).default(5),
});
export type GenerateCalendarInput = z.infer<typeof GenerateCalendarSchema>;

export const RepurposeSchema = z.object({
  targetFormat: z.enum([
    "psychoeducation",
    "normalization",
    "coping_skill",
    "story",
    "cta",
  ]),
});
export type RepurposeInput = z.infer<typeof RepurposeSchema>;
