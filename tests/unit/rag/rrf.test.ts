import { describe, it, expect, vi } from "vitest";

// Mock the database before importing functions
vi.mock("@smm/db/client", () => ({
  db: { execute: vi.fn() },
}));

import { rrf, applyRecencyBoost } from "../../../packages/rag/src/hybrid";

const makeChunk = (id: string, daysAgo: number) => ({
  chunkId: id,
  content: "test",
  documentTitle: "test",
  sourceType: "file_upload" as const,
  clientId: "c",
  workspaceId: "w",
  createdAt: new Date(Date.now() - daysAgo * 86_400_000),
  metadata: {},
});

describe("rrf", () => {
  it("merges two ranked lists, highest-scoring first", () => {
    const denseList = [makeChunk("A", 0), makeChunk("B", 0), makeChunk("C", 0)];
    const bm25List = [makeChunk("B", 0), makeChunk("A", 0), makeChunk("D", 0)];

    const merged = rrf(denseList, bm25List, 60);

    // A appears at rank 1 in dense (1/(60+1)) + rank 2 in bm25 (1/(60+2)) = highest
    // B appears at rank 2 in dense + rank 1 in bm25
    expect(merged[0]!.chunkId).toBe("A");
    expect(merged[1]!.chunkId).toBe("B");
    expect(merged.map((c) => c.chunkId)).toContain("C");
    expect(merged.map((c) => c.chunkId)).toContain("D");
  });

  it("handles empty dense list", () => {
    const bm25List = [makeChunk("X", 0)];
    const merged = rrf([], bm25List, 60);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.chunkId).toBe("X");
  });

  it("deduplicates chunks that appear in both lists", () => {
    const list = [makeChunk("A", 0)];
    const merged = rrf(list, list, 60);
    expect(merged).toHaveLength(1);
  });
});

describe("applyRecencyBoost", () => {
  it("boosts recent chunks more than old chunks", () => {
    const recentChunk = { ...makeChunk("recent", 1), score: 1.0 };
    const oldChunk = { ...makeChunk("old", 365), score: 1.0 };

    const boosted = applyRecencyBoost([recentChunk, oldChunk], 0.3);

    expect(boosted[0]!.score).toBeGreaterThan(boosted[1]!.score);
  });

  it("preserves relative order when recencyWeight is 0", () => {
    const a = { ...makeChunk("a", 10), score: 2.0 };
    const b = { ...makeChunk("b", 1), score: 1.0 };

    const boosted = applyRecencyBoost([a, b], 0);

    expect(boosted[0]!.score).toBeGreaterThan(boosted[1]!.score);
  });
});
