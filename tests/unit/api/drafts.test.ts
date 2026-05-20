import { describe, it, expect } from "vitest";
import { SaveDraftSchema } from "../../../packages/types/src/generation";

describe("SaveDraftSchema", () => {
  it("accepts a valid draft", () => {
    const result = SaveDraftSchema.safeParse({
      hook: "What your anxiety is actually telling you",
      caption: "Anxiety is often misunderstood as a character flaw...",
      hashtags: ["#anxietytips", "#mentalhealth"],
      format: "psychoeducation",
      requiresCrisisResources: false,
    });
    expect(result.success).toBe(true);
  });

  it("rejects draft with empty hook", () => {
    const result = SaveDraftSchema.safeParse({
      hook: "",
      caption: "Some caption here that is long enough",
    });
    expect(result.success).toBe(false);
  });

  it("rejects draft with caption that is too short", () => {
    const result = SaveDraftSchema.safeParse({
      hook: "Valid hook text here",
      caption: "Too short",
    });
    expect(result.success).toBe(false);
  });
});
