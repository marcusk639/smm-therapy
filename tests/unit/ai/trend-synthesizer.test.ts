import { describe, it, expect } from "vitest";
import { buildTrendSynthesizerPrompt } from "../../../packages/ai/src/agents/trend-synthesizer";

describe("buildTrendSynthesizerPrompt", () => {
  it("includes source posts", () => {
    const prompt = buildTrendSynthesizerPrompt([
      "Therapists are burning out post-pandemic",
      "New DBT workbook for borderline clients",
      "Survey: 70% of teens report anxiety symptoms",
    ]);
    expect(prompt).toContain("burning out");
    expect(prompt).toContain("JSON");
  });

  it("requests exactly 5 topics", () => {
    const prompt = buildTrendSynthesizerPrompt(["post1", "post2"]);
    expect(prompt).toContain("5");
  });

  it("caps at 50 posts", () => {
    const posts = Array.from({ length: 60 }, (_, i) => `post ${i}`);
    const prompt = buildTrendSynthesizerPrompt(posts);
    expect(prompt).toContain("post 49");
    expect(prompt).not.toContain("post 50");
  });
});
