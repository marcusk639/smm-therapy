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
