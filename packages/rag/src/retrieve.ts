import { embed } from "@smm/ai/embeddings";
import { fusedSearch } from "./hybrid";
import { voyageRerank } from "./rerank";
import { rewriteQuery } from "./query-rewrite";

export type RetrievedChunk = {
  chunkId: string;
  content: string;
  documentTitle: string;
  sourceType: string;
  score: number;
  metadata: Record<string, unknown>;
};

export type RetrieveOptions = {
  clientId: string;
  workspaceId: string;
  limit?: number;
  recencyWeight?: number;
};

export type RetrieveResult = {
  chunks: RetrievedChunk[];
  contextText: string;
};

/**
 * Main retrieval entry point: rewrite → embed → hybrid search → rerank → return
 */
export async function retrieve(
  query: string,
  options: RetrieveOptions,
): Promise<RetrieveResult> {
  const { clientId, workspaceId, limit = 10, recencyWeight = 0.15 } = options;

  const rewritten = await rewriteQuery(query);
  const [queryEmbedding] = await embed([rewritten]);

  if (!queryEmbedding) return { chunks: [], contextText: "" };

  const candidates = await fusedSearch(
    rewritten,
    queryEmbedding,
    clientId,
    workspaceId,
    50,
    recencyWeight,
  );

  if (candidates.length === 0) return { chunks: [], contextText: "" };

  const reranked = await voyageRerank(rewritten, candidates);
  const top = reranked.slice(0, limit);

  const chunks: RetrievedChunk[] = top.map((c) => ({
    chunkId: c.chunkId,
    content: c.content,
    documentTitle: c.documentTitle,
    sourceType: c.sourceType,
    score: c.score,
    metadata: c.metadata,
  }));

  const contextText = chunks
    .map((c, i) => `[${i + 1}] ${c.documentTitle}\n${c.content}`)
    .join("\n\n---\n\n");

  return { chunks, contextText };
}
