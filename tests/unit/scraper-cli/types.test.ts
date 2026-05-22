import { describe, it, expect } from "vitest";
import type {
  ScrapedPage,
  ParsedBlock,
} from "../../../tools/scraper-cli/src/types";

describe("types", () => {
  it("ScrapedPage has required fields", () => {
    const page: ScrapedPage = {
      url: "https://example.com",
      title: "Test",
      html: "<p>hello</p>",
      scrapedAt: new Date(),
    };
    expect(page.url).toBe("https://example.com");
  });

  it("ParsedBlock has content and source", () => {
    const block: ParsedBlock = {
      content: "Some text",
      title: "Module 1",
      sourceUrl: "https://example.com/module-1",
    };
    expect(block.content).toBe("Some text");
  });
});
