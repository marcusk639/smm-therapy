import { describe, it, expect } from "vitest";
import {
  formatAsIgPosts,
  sanitizeFilename,
} from "../../../tools/scraper-cli/src/output";

describe("formatAsIgPosts", () => {
  it("joins blocks with ---", () => {
    const blocks = [
      { content: "Block one", title: "M1", sourceUrl: "https://x.com/1" },
      { content: "Block two", title: "M1", sourceUrl: "https://x.com/1" },
    ];
    const result = formatAsIgPosts(blocks);
    expect(result).toContain("Block one");
    expect(result).toContain("Block two");
    expect(result).toContain("---");
  });

  it("single block has no separator", () => {
    const result = formatAsIgPosts([
      { content: "Solo", title: "T", sourceUrl: "https://x.com" },
    ]);
    expect(result).toBe("Solo");
  });
});

describe("sanitizeFilename", () => {
  it("replaces spaces and special chars", () => {
    expect(sanitizeFilename("Module 1: Anxiety & Stress")).toBe(
      "module-1-anxiety-stress",
    );
  });

  it("strips leading and trailing dashes", () => {
    expect(sanitizeFilename("  --hello--  ")).toBe("hello");
  });
});
