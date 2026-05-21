import { describe, it, expect } from "vitest";
import { buildVoiceCriticPrompt } from "../../../packages/ai/src/agents/voice-critic";

describe("buildVoiceCriticPrompt", () => {
  it("includes caption in prompt", () => {
    const prompt = buildVoiceCriticPrompt(
      "This is a caption about anxiety.",
      "Warm, avoids jargon, conversational.",
    );
    expect(prompt).toContain("This is a caption about anxiety.");
    expect(prompt).toContain("Warm, avoids jargon");
  });

  it("instructs tool use", () => {
    const prompt = buildVoiceCriticPrompt("cap", "profile");
    expect(prompt).toContain("record_voice_assessment");
  });
});
