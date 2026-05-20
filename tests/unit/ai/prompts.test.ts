import { describe, it, expect } from "vitest";
import { NICHE_EXAMPLES } from "../../../packages/ai/src/templates/niche-examples";
import { buildHookUserPrompt } from "../../../packages/ai/src/prompts/hooks";

describe("NICHE_EXAMPLES", () => {
  it("has at least 5 hook patterns", () => {
    expect(NICHE_EXAMPLES.hookPatterns.length).toBeGreaterThanOrEqual(5);
  });

  it("has at least 3 example hooks", () => {
    expect(NICHE_EXAMPLES.exampleHooks.length).toBeGreaterThanOrEqual(3);
  });
});

describe("buildHookUserPrompt", () => {
  it("includes the topic in the prompt", () => {
    const prompt = buildHookUserPrompt(
      "anxiety management",
      "warm and relatable",
    );
    expect(prompt).toContain("anxiety management");
  });

  it("requests JSON output", () => {
    const prompt = buildHookUserPrompt("depression", "clinical");
    expect(prompt.toLowerCase()).toContain("json");
  });
});
