import { describe, it, expect } from "vitest";
import { buildCitations } from "../../../packages/rag/src/citations";
import type { RetrievedChunk } from "../../../packages/rag/src/retrieve";

const chunk: RetrievedChunk = {
  chunkId: "abc",
  content:
    "Anxiety is extremely common and affects millions of adults in the United States each year.",
  documentTitle: "Anxiety Overview",
  sourceType: "file_upload",
  score: 0.9,
  metadata: { page: 3 },
};

describe("buildCitations", () => {
  it("returns one citation per chunk", () => {
    const citations = buildCitations([chunk]);
    expect(citations).toHaveLength(1);
    expect(citations[0]!.chunkId).toBe("abc");
    expect(citations[0]!.documentTitle).toBe("Anxiety Overview");
  });

  it("truncates excerpt to 150 chars", () => {
    const longChunk = { ...chunk, content: "A".repeat(300) };
    const [citation] = buildCitations([longChunk]);
    expect(citation!.excerpt.length).toBeLessThanOrEqual(153); // 150 + "..."
  });

  it("returns empty array for empty input", () => {
    expect(buildCitations([])).toHaveLength(0);
  });
});
