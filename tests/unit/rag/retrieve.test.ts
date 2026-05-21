import { describe, it, expect, vi } from "vitest";

const mockEmbed = vi.hoisted(() => vi.fn());
const mockFused = vi.hoisted(() => vi.fn());
const mockRerank = vi.hoisted(() => vi.fn());
const mockRewrite = vi.hoisted(() => vi.fn());

vi.mock("@smm/ai/embeddings", () => ({
  embed: mockEmbed,
  cosineSimilarity: vi.fn(),
}));
vi.mock("../../../packages/rag/src/hybrid", () => ({ fusedSearch: mockFused }));
vi.mock("../../../packages/rag/src/rerank", () => ({ voyageRerank: mockRerank }));
vi.mock("../../../packages/rag/src/query-rewrite", () => ({ rewriteQuery: mockRewrite }));

import { retrieve } from "../../../packages/rag/src/retrieve";

const EMBEDDING = Array.from({ length: 1024 }, () => 0.01);

const CHUNK = {
  chunkId: "c1",
  content: "Anxiety is a common mental health challenge.",
  documentTitle: "Mental Health Basics",
  sourceType: "file_upload",
  clientId: "client-1",
  workspaceId: "ws-1",
  createdAt: new Date(),
  metadata: {},
  score: 0.9,
};

describe("retrieve", () => {
  it("returns chunks and contextText", async () => {
    mockRewrite.mockResolvedValueOnce("anxiety management techniques");
    mockEmbed.mockResolvedValueOnce([EMBEDDING]);
    mockFused.mockResolvedValueOnce([CHUNK]);
    mockRerank.mockResolvedValueOnce([CHUNK]);

    const result = await retrieve("anxiety", {
      clientId: "client-1",
      workspaceId: "ws-1",
    });

    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]!.chunkId).toBe("c1");
    expect(result.contextText).toContain("Anxiety is a common");
  });

  it("returns empty result when no chunks found", async () => {
    mockRewrite.mockResolvedValueOnce("anxiety");
    mockEmbed.mockResolvedValueOnce([EMBEDDING]);
    mockFused.mockResolvedValueOnce([]);
    mockRerank.mockResolvedValueOnce([]);

    const result = await retrieve("anxiety", {
      clientId: "client-1",
      workspaceId: "ws-1",
    });

    expect(result.chunks).toHaveLength(0);
    expect(result.contextText).toBe("");
  });
});
