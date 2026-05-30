import { sql, eq, and, isNull, gte } from "drizzle-orm";
import { db } from "@smm/db/client";
import { documents, chunks, knowledgeBases } from "@smm/db/schema";
import { embed as voyageEmbed } from "@smm/ai/embeddings";
import { recursiveChunk } from "./chunkers/recursive";
import { singleChunk } from "./chunkers/single-chunk";
import { headingAwareChunk } from "./chunkers/heading-aware";
import { semanticChunk } from "./chunkers/semantic";
import { fetchFileUpload } from "./sources/file-upload";
import { fetchYoutubeUrl } from "./sources/youtube";
import { fetchPodcastRss } from "./sources/podcast-rss";
import { fetchWebUrl } from "./sources/web-url";
import { fetchIgPosts } from "./sources/ig-posts";
import { fetchGoogleDrive } from "./sources/google-drive";
import type { FetchResultRaw } from "./sources/types";
import type { Chunk } from "./chunkers/types";

const EMBED_BATCH = 96;

type SourceFetcher = (
  doc: typeof documents.$inferSelect,
) => Promise<FetchResultRaw>;

// Source fetchers are registered here; implementations in sources/*.ts
const SOURCE_FETCHERS: Record<string, SourceFetcher> = {};

export function registerSourceFetcher(
  sourceType: string,
  fetcher: SourceFetcher,
) {
  SOURCE_FETCHERS[sourceType] = fetcher;
}

async function setStatus(
  docId: string,
  status: (typeof documents.$inferSelect)["status"],
  extra: { failedStage?: string; failedReason?: string } = {},
) {
  await db
    .update(documents)
    .set({ status, ...extra, updatedAt: new Date() })
    .where(eq(documents.id, docId));
}

export type PipelineResult = {
  chunkCount: number;
};

export async function runIngestionPipeline(
  documentId: string,
): Promise<PipelineResult> {
  // Load document + knowledge base
  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)));

  // Soft-deleted or missing — treat as a no-op so Inngest retries don't
  // keep firing for a document that was deleted between event-enqueue and
  // function-run.
  if (!doc) return { chunkCount: 0 };

  const [kb] = await db
    .select()
    .from(knowledgeBases)
    .where(eq(knowledgeBases.id, doc.knowledgeBaseId));

  if (!kb)
    throw new Error(`KnowledgeBase for document ${documentId} not found`);

  // STAGE: fetch
  await setStatus(doc.id, "fetching");
  const fetcher = SOURCE_FETCHERS[doc.sourceType];
  if (!fetcher)
    throw new Error(`No fetcher registered for sourceType: ${doc.sourceType}`);

  let fetchResult: FetchResultRaw;
  try {
    fetchResult = await fetcher(doc);
  } catch (err) {
    await setStatus(doc.id, "failed", {
      failedStage: "fetch",
      failedReason: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // STAGE: parse + chunk
  await setStatus(doc.id, "chunking");
  let rawChunks: Chunk[];
  try {
    if (doc.sourceType === "ig_posts") {
      if (!fetchResult.posts || fetchResult.posts.length === 0) {
        throw new Error("ig_posts fetch returned no posts");
      }
      rawChunks = singleChunk(fetchResult.posts, {
        sourceType: doc.sourceType,
      });
    } else if (
      doc.sourceType === "file_upload" &&
      fetchResult.elements &&
      fetchResult.elements.length > 0
    ) {
      rawChunks = headingAwareChunk(fetchResult.elements, {
        sourceType: doc.sourceType,
      });
    } else if (
      doc.sourceType === "youtube_url" ||
      doc.sourceType === "podcast_rss"
    ) {
      try {
        rawChunks = await semanticChunk(fetchResult.text, {
          sourceType: doc.sourceType,
        });
      } catch (semErr) {
        // Semantic boundary detection requires a Voyage embedding call;
        // fall back to recursive chunking so transient embed errors don't
        // burn an entire document's 3 Inngest retries.
        console.warn(
          `[ingestion] semanticChunk failed for doc ${doc.id}, falling back to recursive:`,
          semErr,
        );
        rawChunks = recursiveChunk(fetchResult.text, {
          sourceType: doc.sourceType,
          chunkerFallback: "semantic→recursive",
        });
      }
    } else {
      rawChunks = recursiveChunk(fetchResult.text, {
        sourceType: doc.sourceType,
      });
    }

    if (rawChunks.length === 0) {
      throw new Error("No chunks produced — source content may be empty");
    }
  } catch (err) {
    await setStatus(doc.id, "failed", {
      failedStage: "chunk",
      failedReason: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  // STAGE: embed
  await setStatus(doc.id, "embedding");
  const texts = rawChunks.map((c) => c.content);
  const allEmbeddings: number[][] = [];
  try {
    for (let i = 0; i < texts.length; i += EMBED_BATCH) {
      const batch = texts.slice(i, i + EMBED_BATCH);
      const batchEmbeddings = await voyageEmbed(batch);
      allEmbeddings.push(...batchEmbeddings);
    }
  } catch (err) {
    await setStatus(doc.id, "failed", {
      failedStage: "embed",
      failedReason: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  if (allEmbeddings.length !== rawChunks.length) {
    await setStatus(doc.id, "failed", {
      failedStage: "embed",
      failedReason: `Embedding count mismatch: expected ${rawChunks.length}, got ${allEmbeddings.length}`,
    });
    throw new Error("Embedding count mismatch");
  }

  // STAGE: store — idempotent under Inngest retries. We upsert on
  // (documentId, chunkIndex) so re-runs overwrite stale content/embedding,
  // then delete any orphan chunks left from a previous run that produced
  // more chunks than this one. Neon's HTTP driver does not support
  // transactions, so there is a brief window between upsert and orphan
  // delete where the previous run's surplus chunks coexist with the new
  // ones; this is acceptable because the document is in status="storing"
  // and never goes through a zero-chunk state.
  await setStatus(doc.id, "storing");
  try {
    const rows = rawChunks.map((chunk, i) => ({
      documentId: doc.id,
      knowledgeBaseId: doc.knowledgeBaseId,
      clientId: kb.clientId ?? null,
      workspaceId: kb.workspaceId ?? null,
      content: chunk.content,
      embedding: sql`${`[${allEmbeddings[i]!.join(",")}]`}::vector`,
      tsv: sql`to_tsvector('english', ${chunk.content})`,
      chunkIndex: chunk.chunkIndex,
      tokenCount: chunk.tokenCount,
      metadata: chunk.metadata,
    }));

    await db
      .insert(chunks)
      .values(rows)
      .onConflictDoUpdate({
        target: [chunks.documentId, chunks.chunkIndex],
        set: {
          content: sql`excluded.content`,
          embedding: sql`excluded.embedding`,
          tsv: sql`excluded.tsv`,
          tokenCount: sql`excluded.token_count`,
          metadata: sql`excluded.metadata`,
          knowledgeBaseId: sql`excluded.knowledge_base_id`,
          clientId: sql`excluded.client_id`,
          workspaceId: sql`excluded.workspace_id`,
        },
      });

    // Clean up orphan chunks from any previous run that produced more chunks.
    await db
      .delete(chunks)
      .where(
        and(
          eq(chunks.documentId, doc.id),
          gte(chunks.chunkIndex, rawChunks.length),
        ),
      );

    await setStatus(doc.id, "complete");
  } catch (err) {
    await setStatus(doc.id, "failed", {
      failedStage: "store",
      failedReason: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }

  return { chunkCount: rawChunks.length };
}

// Register source fetchers (imported here to avoid circular deps in source files)
registerSourceFetcher("file_upload", fetchFileUpload);
registerSourceFetcher("youtube_url", fetchYoutubeUrl);
registerSourceFetcher("podcast_rss", fetchPodcastRss);
registerSourceFetcher("web_url", fetchWebUrl);
registerSourceFetcher("ig_posts", fetchIgPosts);
registerSourceFetcher("google_drive", fetchGoogleDrive);
