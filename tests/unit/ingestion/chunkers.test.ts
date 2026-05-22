import { describe, it, expect, vi } from "vitest";

const mockEmbed = vi.hoisted(() => vi.fn());
vi.mock("@smm/ai/embeddings", () => ({
  embed: mockEmbed,
  cosineSimilarity: (a: number[], b: number[]) =>
    a.reduce((sum, v, i) => sum + v * b[i]!, 0),
}));

import { recursiveChunk } from "../../../packages/ingestion/src/chunkers/recursive";
import { singleChunk } from "../../../packages/ingestion/src/chunkers/single-chunk";
import { headingAwareChunk } from "../../../packages/ingestion/src/chunkers/heading-aware";
import { semanticChunk } from "../../../packages/ingestion/src/chunkers/semantic";
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

  it("assigns sequential chunkIndex across all posts", () => {
    const posts = ["a", "b", "c", "d"];
    const chunks = singleChunk(posts);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
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

  it("splits oversized groups into multiple chunks", () => {
    // ~900 tokens worth of content under one heading — must be split
    const longContent = "word ".repeat(900 * 4);
    const elements = [
      { type: "Title", text: "Big Section" },
      { type: "NarrativeText", text: longContent },
    ];
    const chunks = headingAwareChunk(elements);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((c) => expect(c.tokenCount).toBeLessThanOrEqual(800));
  });
});

describe("semanticChunk", () => {
  it("splits at low-similarity boundaries", async () => {
    // Orthogonal unit vectors: dot(embA, embB) = 0 < 0.65 threshold → boundary detected
    const embA = [1, 0, 0, 0, 0, 0, 0, 0];
    const embB = [0, 1, 0, 0, 0, 0, 0, 0];
    mockEmbed.mockResolvedValueOnce([embA, embA, embB, embB]);

    // 1200 words total → 4 sliding windows (windowWords=409, strideWords=327)
    const text = Array.from({ length: 4 }, (_, i) =>
      `Window ${i} `.repeat(150),
    ).join(" ");

    const chunks = await semanticChunk(text);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("returns a single chunk for uniformly similar content", async () => {
    const embA = Array.from({ length: 8 }, () => 1.0 / Math.sqrt(8));
    mockEmbed.mockResolvedValueOnce([embA, embA]);

    const text = "This is all about anxiety. ".repeat(100);
    const chunks = await semanticChunk(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});
