import { describe, it, expect } from "vitest";
import { buildCaption } from "../../../packages/inngest/src/functions/ig-publish-utils";

describe("buildCaption", () => {
  it("joins hook, caption, and hashtags", () => {
    const result = buildCaption(
      "3 signs of burnout",
      "Feeling exhausted? Here's what to know.",
      ["mentalhealth", "burnout"],
    );
    expect(result).toContain("3 signs of burnout");
    expect(result).toContain("Feeling exhausted?");
    expect(result).toContain("#mentalhealth");
    expect(result).toContain("#burnout");
  });

  it("omits hashtag block when no hashtags", () => {
    const result = buildCaption("Hook", "Caption", []);
    expect(result).not.toContain("#");
    expect(result).toContain("Hook");
    expect(result).toContain("Caption");
  });
});
