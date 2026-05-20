import { describe, it, expect } from "vitest";
import { z } from "zod";

const BrandVoiceProfileSchema = z.object({
  tone: z.number().int().min(1).max(10),
  vocabularyLevel: z.enum(["plain", "mixed", "clinical"]),
  disclosureLevel: z.enum(["minimal", "moderate", "personal"]),
  preferredStructures: z.array(z.string()),
  avoidPhrases: z.array(z.string()),
  examplePhrases: z.array(z.string()),
});

describe("BrandVoiceProfile schema", () => {
  it("accepts a valid profile", () => {
    const result = BrandVoiceProfileSchema.safeParse({
      tone: 4,
      vocabularyLevel: "plain",
      disclosureLevel: "moderate",
      preferredStructures: ["question hook", "3-item list"],
      avoidPhrases: ["you're not alone"],
      examplePhrases: ["What your anxiety is actually telling you"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects tone out of range", () => {
    const result = BrandVoiceProfileSchema.safeParse({
      tone: 11,
      vocabularyLevel: "plain",
      disclosureLevel: "minimal",
      preferredStructures: [],
      avoidPhrases: [],
      examplePhrases: [],
    });
    expect(result.success).toBe(false);
  });
});
