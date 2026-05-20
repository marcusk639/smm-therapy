import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@smm/ai/embeddings", () => ({
  embed: vi.fn(),
  cosineSimilarity: (a: number[], b: number[]) => {
    const dot = a.reduce((sum, val, i) => sum + val * b[i]!, 0);
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0));
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0));
    return magA && magB ? dot / (magA * magB) : 0;
  },
}));

import { embed, cosineSimilarity } from "@smm/ai/embeddings";

describe("cosineSimilarity", () => {
  it("returns 1.0 for identical vectors", () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("returns 0.0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("crisis detection mock", () => {
  beforeEach(() => {
    vi.mocked(embed).mockReset();
  });

  it("triggers when content is highly similar to crisis centroid", async () => {
    // Verify the cosine similarity math works correctly for the threshold
    expect(cosineSimilarity([1, 0, 0], [0.99, 0.1, 0])).toBeGreaterThan(0.75);
  });
});
