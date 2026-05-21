import { describe, it, expect, vi } from "vitest";

const mockRerank = vi.hoisted(() => vi.fn());

vi.mock("voyageai", () => ({
  VoyageAIClient: vi.fn().mockImplementation(() => ({
    rerank: mockRerank,
  })),
}));

import { voyageRerank } from "../../../packages/rag/src/rerank";
import type { ScoredChunk } from "../../../packages/rag/src/hybrid";

const makeChunk = (id: string, score: number): ScoredChunk => ({
  chunkId: id,
  content: `content for ${id}`,
  documentTitle: "doc",
  sourceType: "file_upload",
  clientId: "c",
  workspaceId: "w",
  createdAt: new Date(),
  metadata: {},
  score,
});

describe("voyageRerank", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("re-orders chunks by relevance_score from voyage-rerank-2", async () => {
    mockRerank.mockResolvedValueOnce({
      data: [
        { index: 1, relevance_score: 0.95 },
        { index: 0, relevance_score: 0.72 },
      ],
    });

    const chunks = [makeChunk("A", 0.5), makeChunk("B", 0.3)];
    const result = await voyageRerank("anxiety management", chunks);

    // B (index 1) got score 0.95, A (index 0) got 0.72 — B should come first
    expect(result[0]!.chunkId).toBe("B");
    expect(result[1]!.chunkId).toBe("A");
  });

  it("returns the original order when voyage returns no data", async () => {
    mockRerank.mockResolvedValueOnce({ data: [] });
    const chunks = [makeChunk("A", 0.5), makeChunk("B", 0.3)];
    const result = await voyageRerank("query", chunks);
    expect(result).toEqual(chunks);
  });

  it("returns input unchanged for empty chunk list", async () => {
    const result = await voyageRerank("query", []);
    expect(result).toEqual([]);
    expect(mockRerank).not.toHaveBeenCalled();
  });
});
