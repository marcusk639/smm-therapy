import { describe, it, expect, vi, beforeEach } from "vitest";

const mockExecute = vi.hoisted(() => vi.fn());

vi.mock("@smm/db/client", () => ({
  db: { execute: mockExecute },
}));

import { denseSearch, bm25Search } from "../../../packages/rag/src/hybrid";

const FAKE_EMBEDDING = Array.from({ length: 1024 }, () => 0.01);

const MOCK_ROW = {
  chunk_id: "abc-123",
  content: "Anxiety affects millions of people.",
  document_title: "Mental Health Guide",
  source_type: "file_upload",
  client_id: "client-1",
  workspace_id: "ws-1",
  created_at: new Date("2025-01-01"),
  metadata: {},
};

describe("denseSearch", () => {
  beforeEach(() => {
    mockExecute.mockClear();
  });
  it("returns results from the vector similarity query", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [MOCK_ROW] });

    const results = await denseSearch(FAKE_EMBEDDING, "client-1", "ws-1", 50);

    expect(mockExecute).toHaveBeenCalledOnce();
    expect(results).toHaveLength(1);
    expect(results[0]!.chunkId).toBe("abc-123");
  });

  it("returns empty array when no results", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const results = await denseSearch(FAKE_EMBEDDING, "client-1", "ws-1", 50);
    expect(results).toHaveLength(0);
  });
});

describe("bm25Search", () => {
  beforeEach(() => {
    mockExecute.mockClear();
  });

  it("returns results from the tsvector query", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [MOCK_ROW] });

    const results = await bm25Search(
      "anxiety management",
      "client-1",
      "ws-1",
      50,
    );

    expect(mockExecute).toHaveBeenCalledOnce();
    expect(results[0]!.chunkId).toBe("abc-123");
  });

  it("returns empty array when query matches nothing", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [] });
    const results = await bm25Search("xyzzy gibberish", "client-1", "ws-1", 50);
    expect(results).toHaveLength(0);
  });
});
