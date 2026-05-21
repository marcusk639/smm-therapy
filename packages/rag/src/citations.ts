import type { RetrievedChunk } from "./retrieve";

export type Citation = {
  chunkId: string;
  documentTitle: string;
  sourceType: string;
  excerpt: string;
};

export function buildCitations(chunks: RetrievedChunk[]): Citation[] {
  return chunks.map((chunk) => ({
    chunkId: chunk.chunkId,
    documentTitle: chunk.documentTitle,
    sourceType: chunk.sourceType,
    excerpt:
      chunk.content.length > 150
        ? chunk.content.slice(0, 150) + "..."
        : chunk.content,
  }));
}
