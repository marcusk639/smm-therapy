import { describe, it, expect } from "vitest";
import { buildRepurposePrompt } from "../../../packages/ai/src/agents/repurpose";

describe("buildRepurposePrompt", () => {
  it("includes original hook", () => {
    const prompt = buildRepurposePrompt(
      "3 signs you're burning out",
      "Some caption.",
      "story",
    );
    expect(prompt).toContain("3 signs you're burning out");
  });

  it("includes target format description", () => {
    const prompt = buildRepurposePrompt("hook", "caption", "coping_skill");
    expect(prompt).toContain("coping skill");
  });

  it("requests JSON output", () => {
    const prompt = buildRepurposePrompt("h", "c", "story");
    expect(prompt).toContain("JSON");
  });
});
