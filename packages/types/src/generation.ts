import { z } from "zod";

export const GenerateHooksSchema = z.object({
  topic: z.string().min(3).max(200),
});

export const GenerateCaptionsSchema = z.object({
  selectedHook: z.string().min(5).max(200),
  topic: z.string().min(3).max(200),
  formats: z
    .array(
      z.enum([
        "psychoeducation",
        "normalization",
        "coping_skill",
        "story",
        "cta",
      ]),
    )
    .min(1)
    .max(5)
    .default([
      "psychoeducation",
      "normalization",
      "coping_skill",
      "story",
      "cta",
    ]),
});

export const ExtractBrandVoiceSchema = z.object({
  samplePosts: z.array(z.string().min(10)).min(3).max(30),
});

export const SaveDraftSchema = z.object({
  hook: z.string().min(3).max(300),
  caption: z.string().min(10).max(3000),
  hashtags: z.array(z.string()).max(30).default([]),
  format: z
    .enum(["psychoeducation", "normalization", "coping_skill", "story", "cta"])
    .optional(),
  generationAuditId: z.string().uuid().optional(),
  requiresCrisisResources: z.boolean().default(false),
});

export const BrandVoiceProfileSchema = z.object({
  tone: z.number().int().min(1).max(10),
  vocabularyLevel: z.enum(["plain", "mixed", "clinical"]),
  disclosureLevel: z.enum(["minimal", "moderate", "personal"]),
  preferredStructures: z.array(z.string()),
  avoidPhrases: z.array(z.string()),
  examplePhrases: z.array(z.string()),
});

export type GenerateHooksInput = z.infer<typeof GenerateHooksSchema>;
export type GenerateCaptionsInput = z.infer<typeof GenerateCaptionsSchema>;
export type ExtractBrandVoiceInput = z.infer<typeof ExtractBrandVoiceSchema>;
export type SaveDraftInput = z.infer<typeof SaveDraftSchema>;
export type BrandVoiceProfile = z.infer<typeof BrandVoiceProfileSchema>;
