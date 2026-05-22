import { describe, it, expect } from "vitest";
import { discoverLinks } from "../../../tools/scraper-cli/src/scraper";

describe("discoverLinks", () => {
  it("extracts absolute links matching pattern", () => {
    const html = `
      <html><body>
        <a href="/courses/module-1">Module 1</a>
        <a href="/courses/module-2">Module 2</a>
        <a href="https://external.com/page">External</a>
        <a href="/about">About</a>
      </body></html>
    `;
    const links = discoverLinks(
      html,
      "https://carolineflett.com",
      /\/courses\//,
    );
    expect(links).toHaveLength(2);
    expect(links[0]).toBe("https://carolineflett.com/courses/module-1");
    expect(links[1]).toBe("https://carolineflett.com/courses/module-2");
  });

  it("deduplicates links", () => {
    const html = `
      <a href="/courses/m1">A</a>
      <a href="/courses/m1">B</a>
    `;
    const links = discoverLinks(html, "https://example.com", /\/courses\//);
    expect(links).toHaveLength(1);
  });

  it("excludes external links", () => {
    const html = `<a href="https://other.com/courses/foo">External course</a>`;
    const links = discoverLinks(html, "https://example.com", /\/courses\//);
    expect(links).toHaveLength(0);
  });
});
