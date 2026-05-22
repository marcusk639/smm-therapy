import { describe, it, expect } from "vitest";
import {
  cleanText,
  parsePageToBlocks,
} from "../../../tools/scraper-cli/src/parser";

describe("cleanText", () => {
  it("collapses whitespace", () => {
    expect(cleanText("  hello   world  ")).toBe("hello world");
  });

  it("removes zero-width characters", () => {
    expect(cleanText("hello​world")).toBe("helloworld");
  });
});

describe("parsePageToBlocks", () => {
  it("returns at least one block for readable HTML", () => {
    const html = `
      <html><head><title>Module 1: Anxiety</title></head>
      <body>
        <article>
          <h1>Module 1: Understanding Anxiety</h1>
          <p>Anxiety is a normal response to stress. It becomes problematic when it interferes with daily life.</p>
          <h2>Key concepts</h2>
          <p>The fight-or-flight response activates the sympathetic nervous system.</p>
        </article>
      </body></html>
    `;
    const blocks = parsePageToBlocks(
      html,
      "https://example.com/module-1",
      "Module 1",
    );
    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks[0]!.content.length).toBeGreaterThan(10);
    expect(blocks[0]!.sourceUrl).toBe("https://example.com/module-1");
  });

  it("falls back gracefully on unreadable HTML", () => {
    const blocks = parsePageToBlocks(
      "<html><body></body></html>",
      "https://x.com",
      "empty",
    );
    expect(blocks).toHaveLength(0);
  });
});
