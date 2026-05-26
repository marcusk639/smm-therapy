import { VoyageAIClient } from "voyageai";
import type { ScoredChunk } from "./hybrid";

type RerankItem = { index: number; relevance_score?: number };

function getClient() {
  return new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! });
}

/**
 * Reranks up to 50 chunks using voyage-rerank-2.
 * Returns chunks sorted by relevance score descending.
 */
export async function voyageRerank(
  query: string,
  chunks: ScoredChunk[],
): Promise<ScoredChunk[]> {
  if (chunks.length === 0) {
    return [];
  }

  const client = getClient();

  const response = await client.rerank({
    query,
    documents: chunks.map((c) => c.content),
    model: "voyage-rerank-2",
  });

  const data = (response.data ?? []) as RerankItem[];
  if (data.length === 0) return chunks;

  return data
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
    .map((item) => ({
      ...chunks[item.index]!,
      score: item.relevance_score ?? 0,
    }));
}
