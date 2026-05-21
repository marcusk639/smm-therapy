import { describe, it, expect } from "vitest";
import { recursiveChunk } from "../../../packages/ingestion/src/chunkers/recursive";
import { singleChunk } from "../../../packages/ingestion/src/chunkers/single-chunk";
import { headingAwareChunk } from "../../../packages/ingestion/src/chunkers/heading-aware";
import { countTokens } from "../../../packages/ingestion/src/utils";

describe("countTokens", () => {
  it("approximates token count (~4 chars/token)", () => {
    expect(countTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 → ceil = 3
  });
});

describe("recursiveChunk", () => {
  it("splits text at paragraph boundaries", () => {
    const text = "Para one.\n\nPara two.\n\nPara three.";
    const chunks = recursiveChunk(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]!.content).toContain("Para one");
  });

  it("keeps chunks under 800 tokens", () => {
    const longPara = "word ".repeat(1000);
    const text = [longPara, longPara, longPara, longPara].join("\n\n");
    const chunks = recursiveChunk(text);
    chunks.forEach((c) => expect(c.tokenCount).toBeLessThanOrEqual(800));
  });

  it("assigns sequential chunkIndex", () => {
    const text = "A.\n\nB.\n\nC.";
    const chunks = recursiveChunk(text);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });
});

describe("singleChunk", () => {
  it("returns each post as one chunk", () => {
    const posts = ["Post one text.", "Post two text.", "Post three text."];
    const chunks = singleChunk(posts);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.content).toBe("Post one text.");
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[2]!.chunkIndex).toBe(2);
  });
});

describe("headingAwareChunk", () => {
  it("groups elements under their heading", () => {
    const elements = [
      { type: "Title", text: "Section One" },
      { type: "NarrativeText", text: "Content under section one." },
      { type: "Title", text: "Section Two" },
      { type: "NarrativeText", text: "Content under section two." },
    ];
    const chunks = headingAwareChunk(elements);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.content).toContain("Section One");
    expect(chunks[0]!.content).toContain("Content under section one.");
    expect(chunks[1]!.content).toContain("Section Two");
  });

  it("handles documents with no Title elements", () => {
    const elements = [
      { type: "NarrativeText", text: "Just some text." },
      { type: "NarrativeText", text: "More text." },
    ];
    const chunks = headingAwareChunk(elements);
    expect(chunks.length).toBeGreaterThan(0);
  });
});
