import { sql } from "drizzle-orm";
import { db } from "@smm/db/client";

export type RawChunk = {
  chunkId: string;
  content: string;
  documentTitle: string;
  sourceType: string;
  clientId: string | null;
  workspaceId: string | null;
  createdAt: Date;
  metadata: Record<string, unknown>;
};

export async function denseSearch(
  queryEmbedding: number[],
  clientId: string,
  workspaceId: string,
  limit: number,
): Promise<RawChunk[]> {
  const vecStr = `[${queryEmbedding.join(",")}]`;

  const result = await db.execute(sql`
    SELECT
      c.id          AS chunk_id,
      c.content,
      c.client_id,
      c.workspace_id,
      c.created_at,
      c.metadata,
      d.title       AS document_title,
      d.source_type
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE (
      (c.workspace_id = ${workspaceId} AND c.client_id = ${clientId})
      OR (c.workspace_id IS NULL AND c.client_id IS NULL)
    )
    ORDER BY c.embedding <=> ${vecStr}::vector
    LIMIT ${limit}
  `);

  return (result.rows as Record<string, unknown>[]).map((r) => ({
    chunkId: r.chunk_id as string,
    content: r.content as string,
    documentTitle: r.document_title as string,
    sourceType: r.source_type as string,
    clientId: (r.client_id as string | null) ?? null,
    workspaceId: (r.workspace_id as string | null) ?? null,
    createdAt: new Date(r.created_at as string),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }));
}

export async function bm25Search(
  query: string,
  clientId: string,
  workspaceId: string,
  limit: number,
): Promise<RawChunk[]> {
  const result = await db.execute(sql`
    SELECT
      c.id          AS chunk_id,
      c.content,
      c.client_id,
      c.workspace_id,
      c.created_at,
      c.metadata,
      d.title       AS document_title,
      d.source_type
    FROM chunks c
    JOIN documents d ON d.id = c.document_id
    WHERE (
      (c.workspace_id = ${workspaceId} AND c.client_id = ${clientId})
      OR (c.workspace_id IS NULL AND c.client_id IS NULL)
    )
    AND c.tsv @@ websearch_to_tsquery('english', ${query})
    ORDER BY ts_rank(c.tsv, websearch_to_tsquery('english', ${query})) DESC
    LIMIT ${limit}
  `);

  return (result.rows as Record<string, unknown>[]).map((r) => ({
    chunkId: r.chunk_id as string,
    content: r.content as string,
    documentTitle: r.document_title as string,
    sourceType: r.source_type as string,
    clientId: (r.client_id as string | null) ?? null,
    workspaceId: (r.workspace_id as string | null) ?? null,
    createdAt: new Date(r.created_at as string),
    metadata: (r.metadata as Record<string, unknown>) ?? {},
  }));
}

export type ScoredChunk = RawChunk & { score: number };

/**
 * Reciprocal Rank Fusion — k=60 constant.
 * score(chunk) = Σ 1/(k + rank_in_list) for each list it appears in.
 */
export function rrf(
  denseList: RawChunk[],
  bm25List: RawChunk[],
  k: number,
): ScoredChunk[] {
  const scores = new Map<string, { chunk: RawChunk; score: number }>();

  const addList = (list: RawChunk[]) => {
    list.forEach((chunk, idx) => {
      const existing = scores.get(chunk.chunkId);
      const contribution = 1 / (k + idx + 1);
      if (existing) {
        existing.score += contribution;
      } else {
        scores.set(chunk.chunkId, { chunk, score: contribution });
      }
    });
  };

  addList(denseList);
  addList(bm25List);

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map(({ chunk, score }) => ({ ...chunk, score }));
}

/**
 * Multiplies each chunk's RRF score by an exponential recency factor.
 * recency_factor = exp(-daysAgo / 90) — 90-day half-life decay.
 * final_score = rrf_score * (1 + recencyWeight * recency_factor)
 */
export function applyRecencyBoost(
  chunks: ScoredChunk[],
  recencyWeight: number,
): ScoredChunk[] {
  const now = Date.now();
  return chunks.map((chunk) => {
    const daysAgo = (now - chunk.createdAt.getTime()) / 86_400_000;
    const recencyFactor = Math.exp(-daysAgo / 90);
    return {
      ...chunk,
      score: chunk.score * (1 + recencyWeight * recencyFactor),
    };
  });
}

/**
 * Runs dense + BM25 searches in parallel, fuses via RRF, applies recency boost.
 */
export async function fusedSearch(
  query: string,
  queryEmbedding: number[],
  clientId: string,
  workspaceId: string,
  limit: number,
  recencyWeight = 0.15,
): Promise<ScoredChunk[]> {
  const [denseResults, bm25Results] = await Promise.all([
    denseSearch(queryEmbedding, clientId, workspaceId, 50),
    bm25Search(query, clientId, workspaceId, 50),
  ]);

  const fused = rrf(denseResults, bm25Results, 60);
  const boosted = applyRecencyBoost(fused, recencyWeight);

  return boosted.sort((a, b) => b.score - a.score).slice(0, limit);
}
