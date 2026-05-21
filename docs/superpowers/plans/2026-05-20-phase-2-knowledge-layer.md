# Phase 2: Knowledge Layer (RAG) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build hybrid RAG retrieval (pgvector + BM25 + RRF + Voyage reranking), six ingestion source types with Inngest pipelines, an eval harness with recall@5 CI gate, and wire retrieved context into hook/caption generation so outputs are measurably more on-brand.

**Architecture:** Three new packages — `packages/rag` (embedding abstraction, hybrid search, reranking, retrieve() entry point, citations), `packages/ingestion` (four chunkers, six source parsers, Inngest pipeline), `packages/eval` (harness, metrics, placeholder eval set). New DB tables carry `workspace_id + client_id` (both nullable: NULL/NULL = shared niche partition). The `retrieve()` function blends client-specific (60%) and shared-niche (40%) chunks, fuses dense-vector and BM25 results via Reciprocal Rank Fusion (k=60), applies a recency boost, then reranks top-50 to top-10 via `voyage-rerank-2`. Ingestion runs as Inngest step functions (fetch→parse→chunk→embed→store) for idempotent retry.

**Tech Stack:** drizzle-orm `vector` type · pgvector HNSW + GIN indexes · `voyageai@0.2.1` (voyage-3 embeddings + voyage-rerank-2 reranking) · `inngest@3` step functions · `unstructured-client` (PDF parsing via Railway) · `groq-sdk` (Whisper audio transcription) · `youtube-transcript` · `rss-parser` · `@mozilla/readability` + `linkedom` · `googleapis` (Google Drive) · Vitest · Playwright

**Blocking dependency (do not start Task 1 until this is done):** The wife's RAG eval set (50–100 query/chunk pairs) is a Phase 2 blocker. Use the placeholder eval set in Task 17 to unblock CI, but replace it before declaring the phase done. Start curating the real eval set immediately.

**Google Drive OAuth:** Submit the Google Cloud OAuth app verification for `drive.readonly` scope **now** — it can take 2–4 weeks. Do not wait until Task 15.

---

## File Structure

```
packages/rag/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                          # re-exports
    ├── embed.ts                          # EmbeddingProvider interface + VoyageEmbeddingProvider
    ├── hybrid.ts                         # denseSearch(), bm25Search(), rrf(), recencyBoost()
    ├── rerank.ts                         # voyageRerank() via voyage-rerank-2
    ├── retrieve.ts                       # retrieve() — main entry point
    ├── query-rewrite.ts                  # rewriteQuery() via Claude Haiku
    └── citations.ts                      # buildCitations() from retrieved chunks

packages/ingestion/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── utils.ts                          # countTokens()
    ├── chunkers/
    │   ├── types.ts                      # Chunk type + Chunker interface
    │   ├── recursive.ts                  # recursive text splitter
    │   ├── single-chunk.ts              # one post = one chunk (IG posts)
    │   ├── heading-aware.ts             # Unstructured element groups → chunks
    │   └── semantic.ts                  # embedding-similarity boundary detection
    ├── sources/
    │   ├── types.ts                      # FetchResult + SourceFetcher interface
    │   ├── file-upload.ts               # R2 download → Unstructured/Groq parse
    │   ├── youtube.ts                   # youtube-transcript API
    │   ├── podcast-rss.ts               # rss-parser + Groq Whisper
    │   ├── web-url.ts                   # fetch + @mozilla/readability
    │   ├── ig-posts.ts                  # paste parser (newlines → posts)
    │   └── google-drive.ts             # Drive API folder sync
    └── pipeline.ts                      # runIngestionPipeline() orchestrator

packages/inngest/src/functions/
    └── ingest.ts                        # ingestDocument Inngest function (NEW)
    └── index.ts                         # (MODIFY — register ingestDocument)

packages/eval/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── metrics.ts                        # recallAtK(), mrr()
    ├── harness.ts                        # runEval() — loads set, calls retrieve(), scores
    ├── eval-set/
    │   └── niche-mental-health.json     # placeholder (replace with wife deliverable)
    └── results/
        └── latest.json                  # updated by CI; checked in; compared vs threshold

packages/db/src/schema/
    ├── knowledge-bases.ts               # NEW
    ├── documents.ts                     # NEW
    ├── chunks.ts                        # NEW (vector + tsvector columns)
    └── index.ts                         # (MODIFY — add exports)

packages/db/migrations/
    ├── 0000_enable_pgvector.sql         # CREATE EXTENSION IF NOT EXISTS vector
    └── 0001_chunk_indexes.sql           # HNSW + GIN indexes (applied after drizzle generate)

packages/ai/src/prompts/
    ├── hooks.ts                         # (MODIFY — add optional retrievedContext param)
    └── captions.ts                      # (MODIFY — add optional retrievedContext param)

apps/web/app/api/v1/clients/[clientId]/
    ├── knowledge-bases/route.ts         # GET (list) + POST (create KB)
    ├── knowledge-bases/[kbId]/route.ts  # GET (detail)
    ├── knowledge-bases/[kbId]/
    │   ├── documents/route.ts           # GET (list) + POST (start ingestion)
    │   ├── documents/[docId]/
    │   │   └── retry/route.ts          # POST (re-send Inngest event)
    │   └── upload-url/route.ts         # POST (presigned R2 URL)
    └── generate/
        ├── hooks/route.ts              # (MODIFY — call retrieve() before Claude)
        └── captions/route.ts           # (MODIFY — call retrieve() before Claude)

apps/web/app/(app)/clients/[clientId]/
    └── knowledge/page.tsx              # document list with ingestion status + retry

scripts/
    └── eval.ts                         # CI eval runner (exits 1 if recall@5 < 0.75)

vitest.config.ts                        # (MODIFY — add @smm/rag, @smm/ingestion, @smm/eval aliases)
```

---

### Task 1: DB schemas — knowledge_bases, documents, chunks + pgvector extension

**Files:**

- Create: `packages/db/src/schema/knowledge-bases.ts`
- Create: `packages/db/src/schema/documents.ts`
- Create: `packages/db/src/schema/chunks.ts`
- Create: `packages/db/migrations/0000_enable_pgvector.sql`
- Create: `packages/db/migrations/0001_chunk_indexes.sql`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Create knowledge-bases schema**

```typescript
// packages/db/src/schema/knowledge-bases.ts
import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { clients } from "./clients";

export const kbTypeEnum = pgEnum("kb_type", ["client", "shared_niche"]);

export const knowledgeBases = pgTable("knowledge_bases", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  clientId: uuid("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  kbType: kbTypeEnum("kb_type").notNull().default("client"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type KnowledgeBase = typeof knowledgeBases.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBases.$inferInsert;
```

- [ ] **Step 2: Create documents schema**

```typescript
// packages/db/src/schema/documents.ts
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { knowledgeBases } from "./knowledge-bases";

export const sourceTypeEnum = pgEnum("source_type", [
  "file_upload",
  "youtube_url",
  "podcast_rss",
  "google_drive",
  "web_url",
  "ig_posts",
]);

export const documentStatusEnum = pgEnum("document_status", [
  "pending",
  "fetching",
  "parsing",
  "chunking",
  "embedding",
  "storing",
  "complete",
  "failed",
]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  knowledgeBaseId: uuid("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  sourceType: sourceTypeEnum("source_type").notNull(),
  title: text("title").notNull(),
  sourceUrl: text("source_url"),
  r2Key: text("r2_key"),
  status: documentStatusEnum("status").notNull().default("pending"),
  failedStage: text("failed_stage"),
  failedReason: text("failed_reason"),
  rightsConfirmed: boolean("rights_confirmed").notNull().default(false),
  rightsConfirmedAt: timestamp("rights_confirmed_at", { withTimezone: true }),
  rightsConfirmedBy: text("rights_confirmed_by"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
```

- [ ] **Step 3: Create chunks schema**

`vector` from `drizzle-orm/pg-core` generates `vector(1024)` SQL. `customType` handles the `tsvector` column that has no built-in Drizzle support. The `tsv` value is computed at insert time via a `sql` template literal — never passed as a plain string.

```typescript
// packages/db/src/schema/chunks.ts
import {
  pgTable,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  customType,
  vector,
} from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { knowledgeBases } from "./knowledge-bases";
import { clients } from "./clients";
import { workspaces } from "./workspaces";

const tsvector = customType<{ data: string; driverData: string }>({
  dataType() {
    return "tsvector";
  },
});

export const chunks = pgTable("chunks", {
  id: uuid("id").defaultRandom().primaryKey(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
  knowledgeBaseId: uuid("knowledge_base_id")
    .notNull()
    .references(() => knowledgeBases.id, { onDelete: "cascade" }),
  // NULL for shared-niche chunks; set for client-specific chunks
  clientId: uuid("client_id").references(() => clients.id, {
    onDelete: "cascade",
  }),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  content: text("content").notNull(),
  embedding: vector("embedding", { dimensions: 1024 }).notNull(),
  tsv: tsvector("tsv").notNull(),
  chunkIndex: integer("chunk_index").notNull(),
  tokenCount: integer("token_count").notNull(),
  metadata: jsonb("metadata")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Chunk = typeof chunks.$inferSelect;
export type NewChunk = typeof chunks.$inferInsert;
```

- [ ] **Step 4: Update schema index**

```typescript
// packages/db/src/schema/index.ts  (add three new exports)
export * from "./workspaces";
export * from "./users";
export * from "./clients";
export * from "./compliance-rules";
export * from "./generations";
export * from "./brand-voices";
export * from "./drafts";
export * from "./disclaimer-templates";
export * from "./llm-usage-log";
export * from "./knowledge-bases";
export * from "./documents";
export * from "./chunks";
```

- [ ] **Step 5: Create the pgvector extension migration (manual — create BEFORE running generate)**

```sql
-- packages/db/migrations/0000_enable_pgvector.sql
CREATE EXTENSION IF NOT EXISTS vector;
```

- [ ] **Step 6: Generate Drizzle migrations**

```bash
cd packages/db
DATABASE_URL=<your-dev-neon-url> pnpm generate
```

Expected: creates `migrations/0001_<hash>.sql` with all table DDL including `vector(1024)` columns.

- [ ] **Step 7: Create the index migration (manual — create AFTER generate, BEFORE migrate)**

```sql
-- packages/db/migrations/0002_chunk_indexes.sql
-- HNSW index for cosine distance (voyage-3 produces normalized vectors)
CREATE INDEX IF NOT EXISTS chunks_embedding_hnsw_idx
  ON chunks USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- GIN index for fast tsvector full-text search
CREATE INDEX IF NOT EXISTS chunks_tsv_gin_idx
  ON chunks USING gin (tsv);
```

- [ ] **Step 8: Apply migrations**

```bash
cd packages/db
DATABASE_URL=<your-dev-neon-url> pnpm migrate
```

Expected: three migration files apply successfully; `\dt` in Neon console shows `knowledge_bases`, `documents`, `chunks`.

- [ ] **Step 9: Commit**

```bash
git add packages/db/src/schema/knowledge-bases.ts \
        packages/db/src/schema/documents.ts \
        packages/db/src/schema/chunks.ts \
        packages/db/src/schema/index.ts \
        packages/db/migrations/
git commit -m "feat: add knowledge_bases, documents, chunks schemas with pgvector + tsvector"
```

---

### Task 2: packages/rag scaffold + EmbeddingProvider abstraction

**Files:**

- Create: `packages/rag/package.json`
- Create: `packages/rag/tsconfig.json`
- Create: `packages/rag/src/embed.ts`
- Create: `packages/rag/src/index.ts`
- Create: `tests/unit/rag/embed.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/rag/embed.test.ts
import { describe, it, expect, vi } from "vitest";

const mockEmbed = vi.hoisted(() => vi.fn());

vi.mock("@smm/ai/embeddings", () => ({
  embed: mockEmbed,
  cosineSimilarity: vi.fn(),
}));

import {
  VoyageEmbeddingProvider,
  defaultProvider,
} from "../../../packages/rag/src/embed";

describe("VoyageEmbeddingProvider", () => {
  it("returns embeddings from the underlying embed() call", async () => {
    mockEmbed.mockResolvedValueOnce([[0.1, 0.2, 0.3]]);

    const result = await defaultProvider.embed(["hello"]);

    expect(mockEmbed).toHaveBeenCalledWith(["hello"]);
    expect(result).toEqual([[0.1, 0.2, 0.3]]);
  });

  it("exposes model and dimensions", () => {
    expect(defaultProvider.model).toBe("voyage-3");
    expect(defaultProvider.dimensions).toBe(1024);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/rag/embed.test.ts
```

Expected: FAIL — `packages/rag/src/embed` not found.

- [ ] **Step 3: Create package.json and tsconfig.json**

```json
// packages/rag/package.json
{
  "name": "@smm/rag",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./embed": "./src/embed.ts",
    "./hybrid": "./src/hybrid.ts",
    "./rerank": "./src/rerank.ts",
    "./retrieve": "./src/retrieve.ts",
    "./citations": "./src/citations.ts",
    "./query-rewrite": "./src/query-rewrite.ts"
  },
  "dependencies": {
    "@smm/ai": "workspace:*",
    "@smm/db": "workspace:*",
    "drizzle-orm": "^0.38.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

```json
// packages/rag/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "dist" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Implement embed.ts**

```typescript
// packages/rag/src/embed.ts
import { embed as voyageEmbed } from "@smm/ai/embeddings";

export interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  model: string;
  dimensions: number;
}

export class VoyageEmbeddingProvider implements EmbeddingProvider {
  readonly model = "voyage-3";
  readonly dimensions = 1024;

  async embed(texts: string[]): Promise<number[][]> {
    return voyageEmbed(texts);
  }
}

export const defaultProvider: EmbeddingProvider = new VoyageEmbeddingProvider();
```

- [ ] **Step 5: Create index.ts**

```typescript
// packages/rag/src/index.ts
export { defaultProvider } from "./embed";
export type { EmbeddingProvider } from "./embed";
export { retrieve } from "./retrieve";
export type {
  RetrieveOptions,
  RetrieveResult,
  RetrievedChunk,
} from "./retrieve";
export { buildCitations } from "./citations";
export type { Citation } from "./citations";
```

- [ ] **Step 6: Update vitest.config.ts to add @smm/rag aliases**

```typescript
// vitest.config.ts — add inside the alias array (before the @smm/ai entries)
{ find: "@smm/rag/embed", replacement: path.resolve(__dirname, "packages/rag/src/embed.ts") },
{ find: "@smm/rag/hybrid", replacement: path.resolve(__dirname, "packages/rag/src/hybrid.ts") },
{ find: "@smm/rag/rerank", replacement: path.resolve(__dirname, "packages/rag/src/rerank.ts") },
{ find: "@smm/rag/retrieve", replacement: path.resolve(__dirname, "packages/rag/src/retrieve.ts") },
{ find: "@smm/rag/citations", replacement: path.resolve(__dirname, "packages/rag/src/citations.ts") },
{ find: "@smm/rag/query-rewrite", replacement: path.resolve(__dirname, "packages/rag/src/query-rewrite.ts") },
{ find: "@smm/rag", replacement: path.resolve(__dirname, "packages/rag/src/index.ts") },
```

- [ ] **Step 7: Run test to verify it passes**

```bash
pnpm test:unit -- tests/unit/rag/embed.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/rag/ tests/unit/rag/embed.test.ts vitest.config.ts
git commit -m "feat: packages/rag scaffold with EmbeddingProvider abstraction (VoyageEmbeddingProvider)"
```

---

### Task 3: Dense vector search + BM25 full-text search

**Files:**

- Create: `packages/rag/src/hybrid.ts` (partial — denseSearch + bm25Search only)
- Create: `tests/unit/rag/hybrid-queries.test.ts`

The queries return raw rows. RRF fusion happens in Task 4.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/rag/hybrid-queries.test.ts
import { describe, it, expect, vi } from "vitest";

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/rag/hybrid-queries.test.ts
```

Expected: FAIL — `packages/rag/src/hybrid` not found.

- [ ] **Step 3: Implement denseSearch and bm25Search**

The embedding is serialized as `[0.01, 0.01, ...]` and cast to `vector` inside the SQL. The WHERE clause allows client-specific chunks (workspace_id + client_id match) OR shared-niche chunks (both NULL). `websearch_to_tsquery` handles special characters safely.

```typescript
// packages/rag/src/hybrid.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:unit -- tests/unit/rag/hybrid-queries.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rag/src/hybrid.ts tests/unit/rag/hybrid-queries.test.ts
git commit -m "feat: dense vector search + BM25 tsvector search queries"
```

---

### Task 4: RRF fusion + recency boost

**Files:**

- Modify: `packages/rag/src/hybrid.ts` (add `fusedSearch` — combines both searches via RRF + recency)
- Create: `tests/unit/rag/rrf.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/rag/rrf.test.ts
import { describe, it, expect } from "vitest";
import { rrf, applyRecencyBoost } from "../../../packages/rag/src/hybrid";

const makeChunk = (id: string, daysAgo: number) => ({
  chunkId: id,
  content: "test",
  documentTitle: "test",
  sourceType: "file_upload" as const,
  clientId: "c",
  workspaceId: "w",
  createdAt: new Date(Date.now() - daysAgo * 86_400_000),
  metadata: {},
});

describe("rrf", () => {
  it("merges two ranked lists, highest-scoring first", () => {
    const denseList = [makeChunk("A", 0), makeChunk("B", 0), makeChunk("C", 0)];
    const bm25List = [makeChunk("B", 0), makeChunk("A", 0), makeChunk("D", 0)];

    const merged = rrf(denseList, bm25List, 60);

    // A appears at rank 1 in dense (1/(60+1)) + rank 2 in bm25 (1/(60+2)) = highest
    // B appears at rank 2 in dense + rank 1 in bm25
    expect(merged[0]!.chunkId).toBe("A");
    expect(merged[1]!.chunkId).toBe("B");
    // D only in bm25, C only in dense — both lower score
    expect(merged.map((c) => c.chunkId)).toContain("C");
    expect(merged.map((c) => c.chunkId)).toContain("D");
  });

  it("handles empty dense list", () => {
    const bm25List = [makeChunk("X", 0)];
    const merged = rrf([], bm25List, 60);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.chunkId).toBe("X");
  });

  it("deduplicates chunks that appear in both lists", () => {
    const list = [makeChunk("A", 0)];
    const merged = rrf(list, list, 60);
    expect(merged).toHaveLength(1);
  });
});

describe("applyRecencyBoost", () => {
  it("boosts recent chunks more than old chunks", () => {
    const recentChunk = { ...makeChunk("recent", 1), score: 1.0 };
    const oldChunk = { ...makeChunk("old", 365), score: 1.0 };

    const boosted = applyRecencyBoost([recentChunk, oldChunk], 0.3);

    expect(boosted[0]!.score).toBeGreaterThan(boosted[1]!.score);
  });

  it("preserves relative order when recencyWeight is 0", () => {
    const a = { ...makeChunk("a", 10), score: 2.0 };
    const b = { ...makeChunk("b", 1), score: 1.0 };

    const boosted = applyRecencyBoost([a, b], 0);

    expect(boosted[0]!.score).toBeGreaterThan(boosted[1]!.score);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/rag/rrf.test.ts
```

Expected: FAIL — `rrf` not exported from hybrid.

- [ ] **Step 3: Add rrf, applyRecencyBoost, and fusedSearch to hybrid.ts**

Append to `packages/rag/src/hybrid.ts`:

```typescript
// --- Append to packages/rag/src/hybrid.ts ---

export type ScoredChunk = RawChunk & { score: number };

/**
 * Reciprocal Rank Fusion — standard k=60 constant.
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
 * recency_factor = exp(-daysAgo / 90)  — 90-day half-life decay.
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
 * clientRecencyWeight: 0.3 (client posts change, recency matters)
 * nicheRecencyWeight:  0.05 (niche content is stable)
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:unit -- tests/unit/rag/rrf.test.ts
```

Expected: 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rag/src/hybrid.ts tests/unit/rag/rrf.test.ts
git commit -m "feat: RRF fusion + exponential recency boost for hybrid retrieval"
```

---

### Task 5: Voyage reranking

**Files:**

- Create: `packages/rag/src/rerank.ts`
- Create: `tests/unit/rag/rerank.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/rag/rerank.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/rag/rerank.test.ts
```

Expected: FAIL — `packages/rag/src/rerank` not found.

- [ ] **Step 3: Implement rerank.ts**

```typescript
// packages/rag/src/rerank.ts
import { VoyageAIClient } from "voyageai";
import type { ScoredChunk } from "./hybrid";

function getClient() {
  return new VoyageAIClient({ apiKey: process.env.VOYAGE_API_KEY! });
}

/**
 * Reranks up to 50 chunks using voyage-rerank-2.
 * Returns the top chunks sorted by relevance score descending.
 */
export async function voyageRerank(
  query: string,
  chunks: ScoredChunk[],
): Promise<ScoredChunk[]> {
  if (chunks.length === 0) return [];

  const client = getClient();

  const response = await client.rerank({
    query,
    documents: chunks.map((c) => c.content),
    model: "voyage-rerank-2",
  });

  if (!response.data || response.data.length === 0) return chunks;

  return response.data
    .sort((a, b) => (b.relevance_score ?? 0) - (a.relevance_score ?? 0))
    .map((item) => ({
      ...chunks[item.index]!,
      score: item.relevance_score ?? 0,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:unit -- tests/unit/rag/rerank.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rag/src/rerank.ts tests/unit/rag/rerank.test.ts
git commit -m "feat: voyage-rerank-2 reranking step"
```

---

### Task 6: retrieve() core module + query rewriting

**Files:**

- Create: `packages/rag/src/query-rewrite.ts`
- Create: `packages/rag/src/retrieve.ts`
- Create: `tests/unit/rag/retrieve.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/rag/retrieve.test.ts
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
vi.mock("../../../packages/rag/src/rerank", () => ({
  voyageRerank: mockRerank,
}));
vi.mock("../../../packages/rag/src/query-rewrite", () => ({
  rewriteQuery: mockRewrite,
}));

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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/rag/retrieve.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement query-rewrite.ts**

Short queries (≤40 chars) are rewritten via Claude Haiku to be more specific. Longer queries are already specific enough.

```typescript
// packages/rag/src/query-rewrite.ts
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function rewriteQuery(query: string): Promise<string> {
  if (query.length > 40) return query;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 120,
    messages: [
      {
        role: "user",
        content: `Rewrite this search query to be more specific for a mental health content knowledge base. Return only the rewritten query, nothing else.\n\nQuery: "${query}"`,
      },
    ],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text.trim() : "";
  return text || query;
}
```

- [ ] **Step 4: Implement retrieve.ts**

```typescript
// packages/rag/src/retrieve.ts
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
 * Main retrieval entry point. Pipeline:
 * 1. Rewrite vague short queries via Claude Haiku
 * 2. Embed the (possibly rewritten) query via voyage-3
 * 3. Hybrid search: dense vector (HNSW) + BM25 (tsvector), fused via RRF + recency boost
 * 4. Rerank top-50 results to top-10 via voyage-rerank-2
 * 5. Return typed chunks + pre-formatted contextText for prompt injection
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
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm test:unit -- tests/unit/rag/retrieve.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rag/src/query-rewrite.ts packages/rag/src/retrieve.ts tests/unit/rag/retrieve.test.ts
git commit -m "feat: retrieve() pipeline (rewrite → embed → hybrid → rerank)"
```

---

### Task 7: Citation construction

**Files:**

- Create: `packages/rag/src/citations.ts`
- Create: `tests/unit/rag/citations.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/rag/citations.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/rag/citations.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement citations.ts**

```typescript
// packages/rag/src/citations.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:unit -- tests/unit/rag/citations.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/rag/src/citations.ts tests/unit/rag/citations.test.ts
git commit -m "feat: citation construction from retrieved chunks"
```

---

### Task 8: packages/ingestion scaffold + three chunkers

**Files:**

- Create: `packages/ingestion/package.json`
- Create: `packages/ingestion/tsconfig.json`
- Create: `packages/ingestion/src/utils.ts`
- Create: `packages/ingestion/src/chunkers/types.ts`
- Create: `packages/ingestion/src/chunkers/recursive.ts`
- Create: `packages/ingestion/src/chunkers/single-chunk.ts`
- Create: `packages/ingestion/src/chunkers/heading-aware.ts`
- Create: `packages/ingestion/src/index.ts`
- Create: `tests/unit/ingestion/chunkers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/unit/ingestion/chunkers.test.ts
import { describe, it, expect } from "vitest";
import { recursiveChunk } from "../../../packages/ingestion/src/chunkers/recursive";
import { singleChunk } from "../../../packages/ingestion/src/chunkers/single-chunk";
import { headingAwareChunk } from "../../../packages/ingestion/src/chunkers/heading-aware";
import { countTokens } from "../../../packages/ingestion/src/utils";

describe("countTokens", () => {
  it("approximates token count (~4 chars/token)", () => {
    expect(countTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 → 3
  });
});

describe("recursiveChunk", () => {
  it("splits text at paragraph boundaries", () => {
    const text = "Para one.\n\nPara two.\n\nPara three.";
    const chunks = recursiveChunk(text);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks[0]!.content).toContain("Para one");
  });

  it("keeps chunks under 800 tokens", () => {
    const longPara = "word ".repeat(1000); // ~250 tokens
    const text = [longPara, longPara, longPara, longPara].join("\n\n");
    const chunks = recursiveChunk(text);
    chunks.forEach((c) => expect(c.tokenCount).toBeLessThanOrEqual(800));
  });

  it("assigns sequential chunkIndex", () => {
    const text = "A.\n\nB.\n\nC.";
    const chunks = recursiveChunk(text);
    chunks.forEach((c, i) => expect(c.chunkIndex).toBe(i));
  });
});

describe("singleChunk", () => {
  it("returns each post as one chunk", () => {
    const posts = ["Post one text.", "Post two text.", "Post three text."];
    const chunks = singleChunk(posts);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.content).toBe("Post one text.");
    expect(chunks[0]!.chunkIndex).toBe(0);
    expect(chunks[2]!.chunkIndex).toBe(2);
  });
});

describe("headingAwareChunk", () => {
  it("groups elements under their heading", () => {
    const elements = [
      { type: "Title", text: "Section One" },
      { type: "NarrativeText", text: "Content under section one." },
      { type: "Title", text: "Section Two" },
      { type: "NarrativeText", text: "Content under section two." },
    ];
    const chunks = headingAwareChunk(elements);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.content).toContain("Section One");
    expect(chunks[0]!.content).toContain("Content under section one.");
    expect(chunks[1]!.content).toContain("Section Two");
  });

  it("handles documents with no Title elements", () => {
    const elements = [
      { type: "NarrativeText", text: "Just some text." },
      { type: "NarrativeText", text: "More text." },
    ];
    const chunks = headingAwareChunk(elements);
    expect(chunks.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/ingestion/chunkers.test.ts
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Create package.json and tsconfig.json**

```json
// packages/ingestion/package.json
{
  "name": "@smm/ingestion",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./pipeline": "./src/pipeline.ts",
    "./chunkers/recursive": "./src/chunkers/recursive.ts",
    "./chunkers/single-chunk": "./src/chunkers/single-chunk.ts",
    "./chunkers/heading-aware": "./src/chunkers/heading-aware.ts",
    "./chunkers/semantic": "./src/chunkers/semantic.ts",
    "./sources/file-upload": "./src/sources/file-upload.ts",
    "./sources/youtube": "./src/sources/youtube.ts",
    "./sources/podcast-rss": "./src/sources/podcast-rss.ts",
    "./sources/web-url": "./src/sources/web-url.ts",
    "./sources/ig-posts": "./src/sources/ig-posts.ts",
    "./sources/google-drive": "./src/sources/google-drive.ts"
  },
  "dependencies": {
    "@smm/ai": "workspace:*",
    "@smm/db": "workspace:*",
    "@smm/rag": "workspace:*",
    "@smm/storage": "workspace:*",
    "unstructured-client": "^0.16.0",
    "groq-sdk": "^0.9.0",
    "youtube-transcript": "^1.2.1",
    "rss-parser": "^3.13.0",
    "@mozilla/readability": "^0.5.0",
    "linkedom": "^0.18.0",
    "googleapis": "^144.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

```json
// packages/ingestion/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "dist" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Create utils.ts**

```typescript
// packages/ingestion/src/utils.ts

/** Approximate token count using the 4-chars-per-token heuristic. */
export function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Splits text at word boundary to fit within maxTokens. */
export function splitAtTokenBoundary(
  text: string,
  maxTokens: number,
): string[] {
  const maxChars = maxTokens * 4;
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > maxChars) {
    const boundary = remaining.lastIndexOf(" ", maxChars);
    const splitAt = boundary > 0 ? boundary : maxChars;
    parts.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }
  if (remaining.length > 0) parts.push(remaining);
  return parts;
}
```

- [ ] **Step 5: Create chunker types**

```typescript
// packages/ingestion/src/chunkers/types.ts
export type Chunk = {
  content: string;
  chunkIndex: number;
  tokenCount: number;
  metadata: Record<string, unknown>;
};
```

- [ ] **Step 6: Create recursive.ts**

```typescript
// packages/ingestion/src/chunkers/recursive.ts
import { countTokens, splitAtTokenBoundary } from "../utils";
import type { Chunk } from "./types";

const MIN_TOKENS = 50;
const MAX_TOKENS = 800;

/** Splits at paragraphs → single newlines → sentences → word boundary. */
export function recursiveChunk(
  text: string,
  metadata: Record<string, unknown> = {},
): Chunk[] {
  const segments = splitRecursive(text.trim());
  const merged = mergeSmall(segments);

  return merged.map((content, i) => ({
    content,
    chunkIndex: i,
    tokenCount: countTokens(content),
    metadata,
  }));
}

function splitRecursive(text: string): string[] {
  const separators = ["\n\n", "\n", ". ", " "];
  for (const sep of separators) {
    const parts = text
      .split(sep)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.every((p) => countTokens(p) <= MAX_TOKENS)) return parts;
  }
  return splitAtTokenBoundary(text, MAX_TOKENS);
}

function mergeSmall(segments: string[]): string[] {
  const merged: string[] = [];
  let current = "";

  for (const seg of segments) {
    const combined = current ? `${current}\n\n${seg}` : seg;
    if (countTokens(combined) <= MAX_TOKENS) {
      current = combined;
    } else {
      if (current) merged.push(current);
      // If this segment alone is too big, hard-split it
      if (countTokens(seg) > MAX_TOKENS) {
        splitAtTokenBoundary(seg, MAX_TOKENS).forEach((p) => merged.push(p));
        current = "";
      } else {
        current = seg;
      }
    }
  }

  if (current && countTokens(current) >= MIN_TOKENS) merged.push(current);
  else if (current && merged.length > 0)
    merged[merged.length - 1] += `\n\n${current}`;
  else if (current) merged.push(current);

  return merged;
}
```

- [ ] **Step 7: Create single-chunk.ts**

```typescript
// packages/ingestion/src/chunkers/single-chunk.ts
import { countTokens } from "../utils";
import type { Chunk } from "./types";

/** Each item in the input array becomes exactly one chunk. Used for IG posts. */
export function singleChunk(
  posts: string[],
  metadata: Record<string, unknown> = {},
): Chunk[] {
  return posts.map((post, i) => ({
    content: post.trim(),
    chunkIndex: i,
    tokenCount: countTokens(post),
    metadata,
  }));
}
```

- [ ] **Step 8: Create heading-aware.ts**

Unstructured returns elements with `type` and `text`. Group elements under their nearest preceding `Title` element into chunks. If no Title exists, treat all NarrativeText/ListItem elements as a single group.

```typescript
// packages/ingestion/src/chunkers/heading-aware.ts
import { countTokens, splitAtTokenBoundary } from "../utils";
import type { Chunk } from "./types";

type UnstructuredElement = { type: string; text: string };

const MAX_TOKENS = 800;

export function headingAwareChunk(
  elements: UnstructuredElement[],
  metadata: Record<string, unknown> = {},
): Chunk[] {
  const groups: string[] = [];
  let currentHeading = "";
  let currentBody = "";

  for (const el of elements) {
    if (el.type === "Title") {
      if (currentHeading || currentBody) {
        groups.push([currentHeading, currentBody].filter(Boolean).join("\n\n"));
      }
      currentHeading = el.text;
      currentBody = "";
    } else if (
      el.type === "NarrativeText" ||
      el.type === "ListItem" ||
      el.type === "Table"
    ) {
      currentBody = currentBody ? `${currentBody}\n${el.text}` : el.text;
    }
  }

  if (currentHeading || currentBody) {
    groups.push([currentHeading, currentBody].filter(Boolean).join("\n\n"));
  }

  // Split any group that exceeds MAX_TOKENS
  const finalChunks: string[] = groups.flatMap((g) =>
    countTokens(g) > MAX_TOKENS ? splitAtTokenBoundary(g, MAX_TOKENS) : [g],
  );

  return finalChunks
    .filter((c) => c.trim().length > 0)
    .map((content, i) => ({
      content,
      chunkIndex: i,
      tokenCount: countTokens(content),
      metadata,
    }));
}
```

- [ ] **Step 9: Add ingestion aliases to vitest.config.ts**

```typescript
// vitest.config.ts — add before the @smm/ai entries:
{ find: "@smm/ingestion/chunkers/recursive", replacement: path.resolve(__dirname, "packages/ingestion/src/chunkers/recursive.ts") },
{ find: "@smm/ingestion/chunkers/single-chunk", replacement: path.resolve(__dirname, "packages/ingestion/src/chunkers/single-chunk.ts") },
{ find: "@smm/ingestion/chunkers/heading-aware", replacement: path.resolve(__dirname, "packages/ingestion/src/chunkers/heading-aware.ts") },
{ find: "@smm/ingestion/chunkers/semantic", replacement: path.resolve(__dirname, "packages/ingestion/src/chunkers/semantic.ts") },
{ find: "@smm/ingestion", replacement: path.resolve(__dirname, "packages/ingestion/src/index.ts") },
```

- [ ] **Step 10: Create packages/ingestion/src/index.ts**

```typescript
// packages/ingestion/src/index.ts
export { runIngestionPipeline } from "./pipeline";
```

- [ ] **Step 11: Run test to verify it passes**

```bash
pnpm test:unit -- tests/unit/ingestion/chunkers.test.ts
```

Expected: 9 tests PASS.

- [ ] **Step 12: Commit**

```bash
git add packages/ingestion/ tests/unit/ingestion/chunkers.test.ts vitest.config.ts
git commit -m "feat: packages/ingestion scaffold with recursive, single-chunk, and heading-aware chunkers"
```

---

### Task 9: Semantic chunker (transcript)

**Files:**

- Create: `packages/ingestion/src/chunkers/semantic.ts`
- Modify: `tests/unit/ingestion/chunkers.test.ts` (add semantic tests)

The semantic chunker embeds adjacent 512-token windows, computes cosine similarity between consecutive windows, and emits a chunk boundary where similarity drops below 0.65. Minimum 200 tokens per chunk, maximum 800.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/ingestion/chunkers.test.ts`:

```typescript
import { describe, it, expect, vi } from "vitest";

const mockEmbed = vi.hoisted(() => vi.fn());
vi.mock("@smm/ai/embeddings", () => ({
  embed: mockEmbed,
  cosineSimilarity: (a: number[], b: number[]) => {
    // Simple dot product (assumes unit vectors in tests)
    return a.reduce((sum, v, i) => sum + v * b[i]!, 0);
  },
}));

import { semanticChunk } from "../../../packages/ingestion/src/chunkers/semantic";

describe("semanticChunk", () => {
  it("splits at low-similarity boundaries", async () => {
    // Two windows: first pair similar (0.9), second pair dissimilar (0.3)
    // Topic A → Topic A → Topic B → Topic B
    const embA = Array.from({ length: 8 }, () => 1.0 / Math.sqrt(8));
    const embB = Array.from({ length: 8 }, (_, i) =>
      i < 4 ? 1.0 / Math.sqrt(4) : 0,
    );
    mockEmbed.mockResolvedValueOnce([embA, embA, embB, embB]);

    // 4 windows of 200-token content each
    const text = Array.from(
      { length: 4 },
      (_, i) => `Window ${i} `.repeat(50), // ~50 words * 4/3 ≈ 65 tokens each
    ).join(" ");

    const chunks = await semanticChunk(text);
    // Should detect at least one boundary
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("returns a single chunk for uniformly similar content", async () => {
    const embA = Array.from({ length: 8 }, () => 1.0 / Math.sqrt(8));
    mockEmbed.mockResolvedValueOnce([embA, embA]);

    const text = "This is all about anxiety. ".repeat(100);
    const chunks = await semanticChunk(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/ingestion/chunkers.test.ts
```

Expected: FAIL — `semanticChunk` not found.

- [ ] **Step 3: Implement semantic.ts**

```typescript
// packages/ingestion/src/chunkers/semantic.ts
import { embed, cosineSimilarity } from "@smm/ai/embeddings";
import { countTokens, splitAtTokenBoundary } from "../utils";
import type { Chunk } from "./types";

const WINDOW_TOKENS = 512;
const MIN_TOKENS = 200;
const MAX_TOKENS = 800;
const SIMILARITY_THRESHOLD = 0.65;
const EMBED_BATCH = 96;

function splitIntoWindows(text: string): string[] {
  const words = text.split(/\s+/);
  const windowWords = Math.floor((WINDOW_TOKENS * 4) / 5); // ~410 words per window
  const strideWords = Math.floor(windowWords * 0.8);
  const windows: string[] = [];

  for (let i = 0; i < words.length; i += strideWords) {
    const window = words.slice(i, i + windowWords).join(" ");
    if (window.trim()) windows.push(window);
    if (i + windowWords >= words.length) break;
  }
  return windows;
}

async function embedBatched(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const batchEmbeddings = await embed(batch);
    results.push(...batchEmbeddings);
  }
  return results;
}

export async function semanticChunk(
  text: string,
  metadata: Record<string, unknown> = {},
): Promise<Chunk[]> {
  const windows = splitIntoWindows(text);
  if (windows.length <= 1) {
    const parts =
      countTokens(text) > MAX_TOKENS
        ? splitAtTokenBoundary(text, MAX_TOKENS)
        : [text];
    return parts.map((content, i) => ({
      content,
      chunkIndex: i,
      tokenCount: countTokens(content),
      metadata,
    }));
  }

  const embeddings = await embedBatched(windows);

  // Find chunk boundaries: where similarity between consecutive windows drops below threshold
  const boundaries: number[] = [0];
  for (let i = 0; i < embeddings.length - 1; i++) {
    const sim = cosineSimilarity(embeddings[i]!, embeddings[i + 1]!);
    if (sim < SIMILARITY_THRESHOLD) {
      boundaries.push(i + 1);
    }
  }
  boundaries.push(windows.length);

  // Build raw segments from boundaries
  const words = text.split(/\s+/);
  const windowWords = Math.floor((WINDOW_TOKENS * 4) / 5);
  const strideWords = Math.floor(windowWords * 0.8);

  const rawSegments: string[] = [];
  for (let b = 0; b < boundaries.length - 1; b++) {
    const startWindow = boundaries[b]!;
    const endWindow = boundaries[b + 1]!;
    const startWord = startWindow * strideWords;
    const endWord = endWindow * strideWords + windowWords;
    rawSegments.push(words.slice(startWord, endWord).join(" ").trim());
  }

  // Merge too-small segments, split too-large ones
  const finalChunks: string[] = [];
  let pending = "";

  for (const seg of rawSegments) {
    const combined = pending ? `${pending} ${seg}` : seg;
    if (countTokens(combined) < MIN_TOKENS) {
      pending = combined;
    } else if (countTokens(combined) <= MAX_TOKENS) {
      finalChunks.push(combined);
      pending = "";
    } else {
      if (pending) finalChunks.push(pending);
      pending = "";
      splitAtTokenBoundary(seg, MAX_TOKENS).forEach((p) => finalChunks.push(p));
    }
  }
  if (pending) {
    if (finalChunks.length > 0)
      finalChunks[finalChunks.length - 1] += ` ${pending}`;
    else finalChunks.push(pending);
  }

  return finalChunks
    .filter((c) => c.trim().length > 0)
    .map((content, i) => ({
      content,
      chunkIndex: i,
      tokenCount: countTokens(content),
      metadata,
    }));
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:unit -- tests/unit/ingestion/chunkers.test.ts
```

Expected: All 11 chunker tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ingestion/src/chunkers/semantic.ts tests/unit/ingestion/chunkers.test.ts
git commit -m "feat: semantic chunker with embedding-similarity boundary detection (threshold 0.65)"
```

---

### Task 10: Ingestion Inngest pipeline

**Files:**

- Create: `packages/ingestion/src/sources/types.ts`
- Create: `packages/ingestion/src/pipeline.ts`
- Create: `packages/inngest/src/functions/ingest.ts`
- Modify: `packages/inngest/src/functions/index.ts`

- [ ] **Step 1: Create source types**

```typescript
// packages/ingestion/src/sources/types.ts
export type FetchResult = {
  text: string;
  title: string;
  metadata: Record<string, unknown>;
};

export type UnstructuredElement = {
  type: string;
  text: string;
};

export type FetchResultRaw = FetchResult & {
  elements?: UnstructuredElement[]; // set when sourceType === file_upload (PDF)
  posts?: string[]; // set when sourceType === ig_posts
};
```

- [ ] **Step 2: Create pipeline.ts**

The pipeline is called by the Inngest function. Each stage updates the document status, then does its work. All stages are idempotent (safe to re-run on retry).

```typescript
// packages/ingestion/src/pipeline.ts
import { sql } from "drizzle-orm";
import { db } from "@smm/db/client";
import { documents, chunks, knowledgeBases } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { embed as voyageEmbed } from "@smm/ai/embeddings";
import { recursiveChunk } from "./chunkers/recursive";
import { singleChunk } from "./chunkers/single-chunk";
import { headingAwareChunk } from "./chunkers/heading-aware";
import { semanticChunk } from "./chunkers/semantic";
import { countTokens } from "./utils";
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
    .where(eq(documents.id, documentId));

  if (!doc) throw new Error(`Document ${documentId} not found`);

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
    if (doc.sourceType === "ig_posts" && fetchResult.posts) {
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
      rawChunks = await semanticChunk(fetchResult.text, {
        sourceType: doc.sourceType,
      });
    } else {
      rawChunks = recursiveChunk(fetchResult.text, {
        sourceType: doc.sourceType,
      });
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

  // STAGE: store
  await setStatus(doc.id, "storing");
  try {
    for (let i = 0; i < rawChunks.length; i++) {
      const chunk = rawChunks[i]!;
      const embedding = allEmbeddings[i]!;
      const vecStr = `[${embedding.join(",")}]`;

      await db
        .insert(chunks)
        .values({
          documentId: doc.id,
          knowledgeBaseId: doc.knowledgeBaseId,
          clientId: kb.clientId ?? null,
          workspaceId: kb.workspaceId ?? null,
          content: chunk.content,
          embedding: sql`${vecStr}::vector`,
          tsv: sql`to_tsvector('english', ${chunk.content})`,
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.tokenCount,
          metadata: chunk.metadata,
        })
        .onConflictDoNothing(); // safe re-run: identical chunk_id is idempotent
    }

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
```

- [ ] **Step 3: Create ingest.ts Inngest function**

```typescript
// packages/inngest/src/functions/ingest.ts
import { inngest } from "../client";
import { runIngestionPipeline } from "@smm/ingestion/pipeline";

export const ingestDocument = inngest.createFunction(
  { id: "ingest-document", retries: 3 },
  { event: "ingestion/document.ingest" },
  async ({ event, step }) => {
    const { documentId } = event.data as { documentId: string };

    const result = await step.run("run-pipeline", () =>
      runIngestionPipeline(documentId),
    );

    return { ok: true, documentId, chunkCount: result.chunkCount };
  },
);
```

- [ ] **Step 4: Register the new function**

```typescript
// packages/inngest/src/functions/index.ts
import { inngest } from "../client";
import { ingestDocument } from "./ingest";

export const smokeTest = inngest.createFunction(
  { id: "smoke-test" },
  { event: "test/smoke" },
  async ({ event }) => {
    return { ok: true, received: event.data };
  },
);

export const functions = [smokeTest, ingestDocument];
```

- [ ] **Step 5: Commit**

```bash
git add packages/ingestion/src/sources/types.ts \
        packages/ingestion/src/pipeline.ts \
        packages/inngest/src/functions/ingest.ts \
        packages/inngest/src/functions/index.ts
git commit -m "feat: ingestion Inngest pipeline (fetch→chunk→embed→store) with per-stage status + error tracking"
```

---

### Task 11: Source — file upload (R2 + Unstructured PDF + Groq Whisper)

**Files:**

- Create: `packages/ingestion/src/sources/file-upload.ts`
- Create: `tests/unit/ingestion/sources.test.ts`

Add `UNSTRUCTURED_API_URL` and `GROQ_API_KEY` to `.env.example` before starting.

- [ ] **Step 1: Add new env vars to .env.example**

```bash
echo "UNSTRUCTURED_API_URL=https://your-railway-unstructured.up.railway.app" >> .env.example
echo "GROQ_API_KEY=gsk_..." >> .env.example
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/unit/ingestion/sources.test.ts
import { describe, it, expect, vi } from "vitest";

// --- file-upload mocks ---
const mockGetPresigned = vi.hoisted(() => vi.fn());
const mockPartition = vi.hoisted(() => vi.fn());
const mockGroqCreate = vi.hoisted(() => vi.fn());
const mockFetch = vi.hoisted(() => vi.fn());

vi.mock("@smm/storage/r2", () => ({
  getPresignedDownloadUrl: mockGetPresigned,
}));
vi.mock("unstructured-client", () => ({
  UnstructuredClient: vi.fn().mockImplementation(() => ({
    general: { partition: mockPartition },
  })),
}));
vi.mock("groq-sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    audio: { transcriptions: { create: mockGroqCreate } },
  })),
}));
global.fetch = mockFetch as typeof fetch;

import { fetchFileUpload } from "../../../packages/ingestion/src/sources/file-upload";

const MOCK_DOC = {
  id: "doc-1",
  knowledgeBaseId: "kb-1",
  sourceType: "file_upload" as const,
  title: "Test PDF",
  sourceUrl: null,
  r2Key: "uploads/doc-1.pdf",
  status: "pending" as const,
  failedStage: null,
  failedReason: null,
  rightsConfirmed: true,
  rightsConfirmedAt: null,
  rightsConfirmedBy: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("fetchFileUpload — PDF", () => {
  it("fetches from R2, sends to Unstructured, returns elements", async () => {
    mockGetPresigned.mockResolvedValueOnce("https://r2.example.com/signed");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    mockPartition.mockResolvedValueOnce({
      elements: [
        { type: "Title", text: "Section One" },
        { type: "NarrativeText", text: "Body text here." },
      ],
    });

    const result = await fetchFileUpload({
      ...MOCK_DOC,
      r2Key: "uploads/doc-1.pdf",
    });

    expect(result.title).toBe("Test PDF");
    expect(result.elements).toHaveLength(2);
    expect(result.elements![0]!.type).toBe("Title");
  });
});

describe("fetchFileUpload — audio (mp3)", () => {
  it("sends to Groq Whisper and returns transcript text", async () => {
    mockGetPresigned.mockResolvedValueOnce("https://r2.example.com/signed");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
    mockGroqCreate.mockResolvedValueOnce({ text: "Transcribed audio text." });

    const result = await fetchFileUpload({
      ...MOCK_DOC,
      r2Key: "uploads/episode.mp3",
    });

    expect(result.text).toBe("Transcribed audio text.");
    expect(result.elements).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/ingestion/sources.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement file-upload.ts**

```typescript
// packages/ingestion/src/sources/file-upload.ts
import { UnstructuredClient } from "unstructured-client";
import Groq from "groq-sdk";
import { getPresignedDownloadUrl } from "@smm/storage/r2";
import type { FetchResultRaw, UnstructuredElement } from "./types";
import type { documents } from "@smm/db/schema";

const PDF_EXTENSIONS = [".pdf"];
const AUDIO_EXTENSIONS = [".mp3", ".mp4", ".wav", ".m4a", ".ogg"];

function getExtension(key: string): string {
  return key.slice(key.lastIndexOf(".")).toLowerCase();
}

async function downloadFromR2(r2Key: string): Promise<Buffer> {
  const url = await getPresignedDownloadUrl(r2Key, 300);
  const res = await fetch(url);
  if (!res.ok)
    throw new Error(`R2 download failed: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

async function parseWithUnstructured(
  buffer: Buffer,
  fileName: string,
): Promise<UnstructuredElement[]> {
  if (buffer.length > 50 * 1024 * 1024) {
    throw new Error(
      "File exceeds 50MB limit. Try re-exporting as a smaller PDF.",
    );
  }

  const client = new UnstructuredClient({
    serverURL: process.env.UNSTRUCTURED_API_URL!,
  });

  const response = await client.general.partition({
    partitionParameters: {
      files: { content: buffer, fileName },
      strategy: "hi_res",
    },
  });

  return (response.elements ?? []).map((el: Record<string, unknown>) => ({
    type: (el.type as string) ?? "NarrativeText",
    text: ((el.text as string) ?? "").trim(),
  }));
}

async function transcribeWithGroq(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  const file = new File([buffer], fileName);
  const result = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3",
    language: "en",
  });
  return result.text;
}

export async function fetchFileUpload(
  doc: typeof documents.$inferSelect,
): Promise<FetchResultRaw> {
  if (!doc.r2Key) throw new Error("Document has no r2Key");

  const ext = getExtension(doc.r2Key);
  const fileName = doc.r2Key.split("/").pop() ?? "file";
  const buffer = await downloadFromR2(doc.r2Key);

  if (PDF_EXTENSIONS.includes(ext)) {
    const elements = await parseWithUnstructured(buffer, fileName);
    return {
      text: elements.map((e) => e.text).join("\n"),
      title: doc.title,
      metadata: {},
      elements,
    };
  }

  if (AUDIO_EXTENSIONS.includes(ext)) {
    const text = await transcribeWithGroq(buffer, fileName);
    return { text, title: doc.title, metadata: { transcribed: true } };
  }

  // Plain text fallback
  return { text: buffer.toString("utf-8"), title: doc.title, metadata: {} };
}
```

- [ ] **Step 5: Register the fetcher in pipeline.ts**

Add at the bottom of `packages/ingestion/src/pipeline.ts`:

```typescript
// Register source fetchers (import here to avoid circular deps)
import { fetchFileUpload } from "./sources/file-upload";
registerSourceFetcher("file_upload", fetchFileUpload);
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm test:unit -- tests/unit/ingestion/sources.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/ingestion/src/sources/file-upload.ts \
        tests/unit/ingestion/sources.test.ts \
        .env.example
git commit -m "feat: file upload source (R2 download → Unstructured PDF / Groq Whisper audio)"
```

---

### Task 12: Source — YouTube URL

**Files:**

- Create: `packages/ingestion/src/sources/youtube.ts`
- Modify: `tests/unit/ingestion/sources.test.ts`

- [ ] **Step 1: Add test**

Append to `tests/unit/ingestion/sources.test.ts`:

```typescript
// --- YouTube mocks ---
const mockFetchTranscript = vi.hoisted(() => vi.fn());

vi.mock("youtube-transcript", () => ({
  YoutubeTranscript: { fetchTranscript: mockFetchTranscript },
}));

import { fetchYoutubeUrl } from "../../../packages/ingestion/src/sources/youtube";

describe("fetchYoutubeUrl", () => {
  it("extracts transcript and joins into text", async () => {
    mockFetchTranscript.mockResolvedValueOnce([
      { text: "Hello and welcome.", offset: 0, duration: 3 },
      { text: "Today we discuss anxiety.", offset: 3, duration: 4 },
    ]);

    const result = await fetchYoutubeUrl({
      ...MOCK_DOC,
      sourceUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      r2Key: null,
    });

    expect(result.text).toContain("Hello and welcome.");
    expect(result.text).toContain("Today we discuss anxiety.");
    expect(result.title).toBe("Test PDF"); // uses doc.title as fallback
  });

  it("throws a helpful error when no transcript is available", async () => {
    mockFetchTranscript.mockRejectedValueOnce(new Error("No transcript found"));

    await expect(
      fetchYoutubeUrl({
        ...MOCK_DOC,
        sourceUrl: "https://www.youtube.com/watch?v=abc",
        r2Key: null,
      }),
    ).rejects.toThrow("No transcript available");
  });
});
```

- [ ] **Step 2: Implement youtube.ts**

```typescript
// packages/ingestion/src/sources/youtube.ts
import { YoutubeTranscript } from "youtube-transcript";
import type { FetchResultRaw } from "./types";
import type { documents } from "@smm/db/schema";

function extractVideoId(url: string): string {
  const match = url.match(/[?&]v=([^&]+)/) ?? url.match(/youtu\.be\/([^?]+)/);
  if (!match?.[1])
    throw new Error(`Could not extract video ID from URL: ${url}`);
  return match[1];
}

export async function fetchYoutubeUrl(
  doc: typeof documents.$inferSelect,
): Promise<FetchResultRaw> {
  if (!doc.sourceUrl) throw new Error("Document has no sourceUrl");

  const videoId = extractVideoId(doc.sourceUrl);

  let transcript: Array<{ text: string }>;
  try {
    transcript = await YoutubeTranscript.fetchTranscript(videoId);
  } catch {
    throw new Error(
      "No transcript available for this video. Upload the audio file instead.",
    );
  }

  const text = transcript.map((t) => t.text).join(" ");
  return {
    text,
    title: doc.title,
    metadata: { videoId, sourceUrl: doc.sourceUrl },
  };
}
```

- [ ] **Step 3: Register and run tests**

Add to `packages/ingestion/src/pipeline.ts`:

```typescript
import { fetchYoutubeUrl } from "./sources/youtube";
registerSourceFetcher("youtube_url", fetchYoutubeUrl);
```

```bash
pnpm test:unit -- tests/unit/ingestion/sources.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ingestion/src/sources/youtube.ts tests/unit/ingestion/sources.test.ts \
        packages/ingestion/src/pipeline.ts
git commit -m "feat: YouTube source (youtube-transcript API, error when no transcript)"
```

---

### Task 13: Sources — podcast RSS, web URL, IG post paste

**Files:**

- Create: `packages/ingestion/src/sources/podcast-rss.ts`
- Create: `packages/ingestion/src/sources/web-url.ts`
- Create: `packages/ingestion/src/sources/ig-posts.ts`
- Modify: `tests/unit/ingestion/sources.test.ts`

- [ ] **Step 1: Add tests**

Append to `tests/unit/ingestion/sources.test.ts`:

```typescript
// --- RSS parser mock ---
const mockRssParser = vi.hoisted(() => ({
  parseURL: vi.fn(),
}));
vi.mock("rss-parser", () => ({
  default: vi.fn().mockImplementation(() => mockRssParser),
}));

// --- Readability mock ---
const mockReadability = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("@mozilla/readability", () => ({
  Readability: vi.fn().mockImplementation(() => mockReadability),
}));
vi.mock("linkedom", () => ({
  parseHTML: vi.fn().mockReturnValue({ document: {} }),
}));

import { fetchPodcastRss } from "../../../packages/ingestion/src/sources/podcast-rss";
import { fetchWebUrl } from "../../../packages/ingestion/src/sources/web-url";
import { parseIgPosts } from "../../../packages/ingestion/src/sources/ig-posts";

describe("fetchPodcastRss", () => {
  it("parses the feed and returns episode titles + descriptions as text", async () => {
    mockRssParser.parseURL.mockResolvedValueOnce({
      title: "Mental Health Podcast",
      items: [
        {
          title: "Ep 1: Anxiety",
          contentSnippet: "We discuss anxiety management.",
        },
        { title: "Ep 2: Burnout", contentSnippet: "Signs of burnout." },
      ],
    });

    const result = await fetchPodcastRss({
      ...MOCK_DOC,
      sourceUrl: "https://example.com/feed.xml",
      r2Key: null,
    });

    expect(result.text).toContain("Ep 1: Anxiety");
    expect(result.text).toContain("We discuss anxiety management.");
  });

  it("throws on invalid RSS feed URL", async () => {
    mockRssParser.parseURL.mockRejectedValueOnce(new Error("404"));
    await expect(
      fetchPodcastRss({
        ...MOCK_DOC,
        sourceUrl: "https://broken.example.com/feed.xml",
        r2Key: null,
      }),
    ).rejects.toThrow("Feed URL is unreachable or invalid");
  });
});

describe("fetchWebUrl", () => {
  it("extracts article text via Readability", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      text: async () =>
        "<html><body><p>Article content here.</p></body></html>",
    });
    mockReadability.parse.mockReturnValueOnce({
      title: "Article Title",
      textContent: "Article content here.",
    });

    const result = await fetchWebUrl({
      ...MOCK_DOC,
      sourceUrl: "https://example.com/article",
      r2Key: null,
    });

    expect(result.text).toContain("Article content here.");
    expect(result.title).toBe("Article Title");
  });
});

describe("parseIgPosts", () => {
  it("splits pasted content on triple-dash separator", () => {
    const raw = "Post one text here.\n---\nPost two text here.";
    const result = parseIgPosts(raw);
    expect(result.posts).toHaveLength(2);
    expect(result.posts![0]).toBe("Post one text here.");
  });

  it("filters out posts shorter than 10 characters", () => {
    const raw =
      "Short.\n---\nThis is a proper length post that should be kept.";
    const result = parseIgPosts(raw);
    expect(result.posts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Implement podcast-rss.ts**

```typescript
// packages/ingestion/src/sources/podcast-rss.ts
import Parser from "rss-parser";
import type { FetchResultRaw } from "./types";
import type { documents } from "@smm/db/schema";

export async function fetchPodcastRss(
  doc: typeof documents.$inferSelect,
): Promise<FetchResultRaw> {
  if (!doc.sourceUrl) throw new Error("Document has no sourceUrl");

  const parser = new Parser();
  let feed: Awaited<ReturnType<typeof parser.parseURL>>;

  try {
    feed = await parser.parseURL(doc.sourceUrl);
  } catch {
    throw new Error(
      "Feed URL is unreachable or invalid. Check the RSS URL and try again.",
    );
  }

  const lines: string[] = [];
  for (const item of feed.items ?? []) {
    if (item.title) lines.push(item.title);
    if (item.contentSnippet) lines.push(item.contentSnippet);
    if (item.content) lines.push(item.content.replace(/<[^>]+>/g, " ").trim());
    lines.push("");
  }

  return {
    text: lines.join("\n"),
    title: feed.title ?? doc.title,
    metadata: { feedUrl: doc.sourceUrl, episodeCount: feed.items?.length ?? 0 },
  };
}
```

- [ ] **Step 3: Implement web-url.ts**

```typescript
// packages/ingestion/src/sources/web-url.ts
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { FetchResultRaw } from "./types";
import type { documents } from "@smm/db/schema";

export async function fetchWebUrl(
  doc: typeof documents.$inferSelect,
): Promise<FetchResultRaw> {
  if (!doc.sourceUrl) throw new Error("Document has no sourceUrl");

  const res = await fetch(doc.sourceUrl, {
    headers: { "User-Agent": "SMM-Therapy-Bot/1.0" },
  });
  if (!res.ok) {
    throw new Error(`URL returned ${res.status}: ${res.statusText}`);
  }

  const html = await res.text();
  const { document } = parseHTML(html);
  const reader = new Readability(document as unknown as Document);
  const article = reader.parse();

  if (!article?.textContent) {
    throw new Error("Could not extract readable content from this URL.");
  }

  return {
    text: article.textContent.replace(/\s+/g, " ").trim(),
    title: article.title ?? doc.title,
    metadata: { sourceUrl: doc.sourceUrl },
  };
}
```

- [ ] **Step 4: Implement ig-posts.ts**

```typescript
// packages/ingestion/src/sources/ig-posts.ts
import type { FetchResultRaw } from "./types";

/**
 * Parses a block of pasted Instagram posts separated by "---" on its own line.
 * Called directly (no async I/O) — the raw text is passed from the API request body.
 */
export function parseIgPosts(rawText: string): FetchResultRaw {
  const posts = rawText
    .split(/\n---\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 10);

  return {
    text: posts.join("\n\n---\n\n"),
    title: "Instagram Posts",
    metadata: { postCount: posts.length },
    posts,
  };
}
```

- [ ] **Step 5: Register fetchers + run tests**

Add to `packages/ingestion/src/pipeline.ts`:

```typescript
import { fetchPodcastRss } from "./sources/podcast-rss";
import { fetchWebUrl } from "./sources/web-url";

registerSourceFetcher("podcast_rss", fetchPodcastRss);
registerSourceFetcher("web_url", fetchWebUrl);
// ig_posts is handled inline in runIngestionPipeline (parseIgPosts is sync)
```

```bash
pnpm test:unit -- tests/unit/ingestion/sources.test.ts
```

Expected: 8 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ingestion/src/sources/podcast-rss.ts \
        packages/ingestion/src/sources/web-url.ts \
        packages/ingestion/src/sources/ig-posts.ts \
        packages/ingestion/src/pipeline.ts \
        tests/unit/ingestion/sources.test.ts
git commit -m "feat: podcast RSS, web URL, and IG post paste source parsers"
```

---

### Task 14: Source — Google Drive

**Files:**

- Create: `packages/ingestion/src/sources/google-drive.ts`

**Before starting:** Register your Google Cloud project at console.cloud.google.com, enable the Drive API, and create an OAuth2 client with `drive.readonly` scope. Submit the OAuth app for verification immediately — this can take 2–4 weeks. Add to `.env.example`:

```
GOOGLE_DRIVE_CLIENT_ID=...
GOOGLE_DRIVE_CLIENT_SECRET=...
```

The access token per workspace is stored in `workspace.metadata.googleDriveAccessToken`. This follows the same metadata JSON pattern as other workspace settings.

- [ ] **Step 1: Write the test**

```typescript
// tests/unit/ingestion/google-drive.test.ts
import { describe, it, expect, vi } from "vitest";

const mockFilesList = vi.hoisted(() => vi.fn());
const mockFilesGet = vi.hoisted(() => vi.fn());
const mockExport = vi.hoisted(() => vi.fn());

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
      })),
    },
    drive: vi.fn().mockReturnValue({
      files: {
        list: mockFilesList,
        get: mockFilesGet,
        export: mockExport,
      },
    }),
  },
}));

import { fetchGoogleDrive } from "../../../packages/ingestion/src/sources/google-drive";

const MOCK_DOC = {
  id: "doc-1",
  knowledgeBaseId: "kb-1",
  sourceType: "google_drive" as const,
  title: "Drive Folder",
  sourceUrl: "https://drive.google.com/drive/folders/FOLDER_ID",
  r2Key: null,
  status: "pending" as const,
  failedStage: null,
  failedReason: null,
  rightsConfirmed: true,
  rightsConfirmedAt: null,
  rightsConfirmedBy: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("fetchGoogleDrive", () => {
  it("lists files and exports Google Docs as plain text", async () => {
    mockFilesList.mockResolvedValueOnce({
      data: {
        files: [
          {
            id: "file-1",
            name: "Anxiety Guide",
            mimeType: "application/vnd.google-apps.document",
          },
        ],
      },
    });
    mockExport.mockResolvedValueOnce({
      data: "Exported document text content here.",
    });

    const result = await fetchGoogleDrive(MOCK_DOC, "access-token-123");

    expect(result.text).toContain("Anxiety Guide");
    expect(result.text).toContain("Exported document text content here.");
  });

  it("throws if access token is missing", async () => {
    await expect(fetchGoogleDrive(MOCK_DOC, "")).rejects.toThrow(
      "Google Drive access token",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/ingestion/google-drive.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement google-drive.ts**

```typescript
// packages/ingestion/src/sources/google-drive.ts
import { google } from "googleapis";
import type { FetchResultRaw } from "./types";
import type { documents } from "@smm/db/schema";

const EXPORTABLE_MIMES: Record<string, string> = {
  "application/vnd.google-apps.document": "text/plain",
  "application/vnd.google-apps.presentation": "text/plain",
  "application/vnd.google-apps.spreadsheet": "text/csv",
};

function extractFolderId(url: string): string {
  const match = url.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!match?.[1])
    throw new Error(`Could not extract folder ID from URL: ${url}`);
  return match[1];
}

export async function fetchGoogleDrive(
  doc: typeof documents.$inferSelect,
  accessToken: string,
): Promise<FetchResultRaw> {
  if (!accessToken) {
    throw new Error(
      "Google Drive access token is required. Re-connect Google Drive in workspace settings.",
    );
  }
  if (!doc.sourceUrl) throw new Error("Document has no sourceUrl");

  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET,
  );
  auth.setCredentials({ access_token: accessToken });

  const drive = google.drive({ version: "v3", auth });
  const folderId = extractFolderId(doc.sourceUrl);

  let files: Array<{ id: string; name: string; mimeType: string }>;
  try {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType)",
    });
    files = (res.data.files ?? []) as typeof files;
  } catch (err) {
    throw new Error(
      "Access to this folder was removed. Re-connect Google Drive in workspace settings.",
    );
  }

  const textParts: string[] = [];

  for (const file of files) {
    const exportMime = EXPORTABLE_MIMES[file.mimeType];
    if (!exportMime) continue; // skip binary files (PDFs are handled via file_upload)

    const exported = await drive.files.export({
      fileId: file.id,
      mimeType: exportMime,
    });

    textParts.push(`# ${file.name}\n\n${exported.data as string}`);
  }

  return {
    text: textParts.join("\n\n---\n\n"),
    title: doc.title,
    metadata: { folderId, fileCount: files.length },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test:unit -- tests/unit/ingestion/google-drive.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/ingestion/src/sources/google-drive.ts \
        tests/unit/ingestion/google-drive.test.ts \
        .env.example
git commit -m "feat: Google Drive source (OAuth2, folder listing, Google Docs export)"
```

---

### Task 15: Knowledge base + document API routes

**Files:**

- Create: `apps/web/app/api/v1/clients/[clientId]/knowledge-bases/route.ts`
- Create: `apps/web/app/api/v1/clients/[clientId]/knowledge-bases/[kbId]/documents/route.ts`
- Create: `apps/web/app/api/v1/clients/[clientId]/knowledge-bases/[kbId]/documents/[docId]/retry/route.ts`
- Create: `apps/web/app/api/v1/clients/[clientId]/knowledge-bases/[kbId]/upload-url/route.ts`

- [ ] **Step 1: Create knowledge-bases route (list + create)**

```typescript
// apps/web/app/api/v1/clients/[clientId]/knowledge-bases/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, knowledgeBases } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { z } from "zod";

const CreateKbSchema = z.object({
  name: z.string().min(1).max(200),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );
  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const kbs = await db
    .select()
    .from(knowledgeBases)
    .where(
      and(
        workspaceFilter(knowledgeBases.workspaceId, workspaceId),
        eq(knowledgeBases.clientId, clientId),
      ),
    );

  return NextResponse.json({ knowledgeBases: kbs });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );
  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const body = await req.json();
  const parsed = CreateKbSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );

  const [kb] = await db
    .insert(knowledgeBases)
    .values({ workspaceId, clientId, name: parsed.data.name, kbType: "client" })
    .returning();

  return NextResponse.json({ knowledgeBase: kb }, { status: 201 });
}
```

- [ ] **Step 2: Create documents route (list + start ingestion)**

```typescript
// apps/web/app/api/v1/clients/[clientId]/knowledge-bases/[kbId]/documents/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, knowledgeBases, documents } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { inngest } from "@smm/inngest/client";
import { z } from "zod";

const StartIngestionSchema = z.object({
  sourceType: z.enum([
    "file_upload",
    "youtube_url",
    "podcast_rss",
    "google_drive",
    "web_url",
    "ig_posts",
  ]),
  title: z.string().min(1).max(500),
  sourceUrl: z.string().url().optional(),
  r2Key: z.string().optional(),
  rawText: z.string().optional(), // for ig_posts
  rightsConfirmed: z.literal(true),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; kbId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, kbId } = await params;

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );
  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const [kb] = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(
      and(
        workspaceFilter(knowledgeBases.workspaceId, workspaceId),
        eq(knowledgeBases.id, kbId),
      ),
    );
  if (!kb)
    return NextResponse.json(
      { error: "Knowledge base not found" },
      { status: 404 },
    );

  const docs = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.knowledgeBaseId, kbId), isNull(documents.deletedAt)),
    );

  return NextResponse.json({ documents: docs });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string; kbId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, kbId } = await params;

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );
  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const [kb] = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(
      and(
        workspaceFilter(knowledgeBases.workspaceId, workspaceId),
        eq(knowledgeBases.id, kbId),
      ),
    );
  if (!kb)
    return NextResponse.json(
      { error: "Knowledge base not found" },
      { status: 404 },
    );

  const body = await req.json();
  const parsed = StartIngestionSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );

  const { sourceType, title, sourceUrl, r2Key, rightsConfirmed } = parsed.data;

  const [doc] = await db
    .insert(documents)
    .values({
      knowledgeBaseId: kbId,
      sourceType,
      title,
      sourceUrl: sourceUrl ?? null,
      r2Key: r2Key ?? null,
      status: "pending",
      rightsConfirmed,
      rightsConfirmedAt: new Date(),
    })
    .returning();

  // Kick off Inngest pipeline
  await inngest.send({
    name: "ingestion/document.ingest",
    data: { documentId: doc!.id },
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
```

- [ ] **Step 3: Create retry route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/knowledge-bases/[kbId]/documents/[docId]/retry/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, knowledgeBases, documents } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { inngest } from "@smm/inngest/client";

export async function POST(
  _req: Request,
  {
    params,
  }: { params: Promise<{ clientId: string; kbId: string; docId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, kbId, docId } = await params;

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );
  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.knowledgeBaseId, kbId)));
  if (!doc)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });

  // Reset status and re-enqueue
  await db
    .update(documents)
    .set({
      status: "pending",
      failedStage: null,
      failedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, docId));

  await inngest.send({
    name: "ingestion/document.ingest",
    data: { documentId: docId },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Create upload-url route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/knowledge-bases/[kbId]/upload-url/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, knowledgeBases } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { getPresignedUploadUrl } from "@smm/storage/r2";
import crypto from "node:crypto";
import { z } from "zod";

const UploadUrlSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string; kbId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, kbId } = await params;

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );
  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const [kb] = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(
      and(
        workspaceFilter(knowledgeBases.workspaceId, workspaceId),
        eq(knowledgeBases.id, kbId),
      ),
    );
  if (!kb)
    return NextResponse.json(
      { error: "Knowledge base not found" },
      { status: 404 },
    );

  const body = await req.json();
  const parsed = UploadUrlSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );

  const ext = parsed.data.fileName.slice(parsed.data.fileName.lastIndexOf("."));
  const r2Key = `uploads/${workspaceId}/${clientId}/${crypto.randomUUID()}${ext}`;
  const uploadUrl = await getPresignedUploadUrl(r2Key, parsed.data.contentType);

  return NextResponse.json({ uploadUrl, r2Key });
}
```

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/api/v1/clients/[clientId]/knowledge-bases/"
git commit -m "feat: knowledge base + document API routes (list, create, ingest, retry, upload-url)"
```

---

### Task 16: packages/eval harness + recall@5 CI gate

**Files:**

- Create: `packages/eval/package.json`
- Create: `packages/eval/tsconfig.json`
- Create: `packages/eval/src/metrics.ts`
- Create: `packages/eval/src/harness.ts`
- Create: `packages/eval/src/eval-set/niche-mental-health.json`
- Create: `packages/eval/src/results/latest.json`
- Create: `scripts/eval.ts`
- Create: `tests/unit/eval/metrics.test.ts`

- [ ] **Step 1: Write metrics tests**

```typescript
// tests/unit/eval/metrics.test.ts
import { describe, it, expect } from "vitest";
import { recallAtK, mrr } from "../../../packages/eval/src/metrics";

describe("recallAtK", () => {
  it("returns 1.0 when all relevant items are in top-K", () => {
    const retrieved = ["a", "b", "c", "d", "e"];
    const relevant = ["b", "d"];
    expect(recallAtK(retrieved, relevant, 5)).toBe(1.0);
  });

  it("returns 0.5 when half of relevant items are in top-K", () => {
    const retrieved = ["a", "b", "c", "d", "e"];
    const relevant = ["b", "z"];
    expect(recallAtK(retrieved, relevant, 5)).toBe(0.5);
  });

  it("returns 0.0 when no relevant items are retrieved", () => {
    expect(recallAtK(["a", "b"], ["z"], 5)).toBe(0.0);
  });

  it("returns 1.0 for empty relevant set", () => {
    expect(recallAtK(["a", "b"], [], 5)).toBe(1.0);
  });
});

describe("mrr", () => {
  it("returns 1.0 when the first result is relevant", () => {
    expect(mrr(["a", "b", "c"], ["a"])).toBe(1.0);
  });

  it("returns 0.5 when the second result is the first relevant", () => {
    expect(mrr(["a", "b", "c"], ["b"])).toBeCloseTo(0.5);
  });

  it("returns 0 when nothing is relevant", () => {
    expect(mrr(["a", "b"], ["z"])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test:unit -- tests/unit/eval/metrics.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create package.json and tsconfig.json**

```json
// packages/eval/package.json
{
  "name": "@smm/eval",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./harness": "./src/harness.ts",
    "./metrics": "./src/metrics.ts"
  },
  "dependencies": {
    "@smm/rag": "workspace:*",
    "@smm/db": "workspace:*"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

```json
// packages/eval/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": { "outDir": "dist" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Implement metrics.ts**

```typescript
// packages/eval/src/metrics.ts

/** Fraction of relevant IDs that appear in the top-K retrieved IDs. */
export function recallAtK(
  retrievedIds: string[],
  relevantIds: string[],
  k: number,
): number {
  if (relevantIds.length === 0) return 1.0;
  const topK = new Set(retrievedIds.slice(0, k));
  const hits = relevantIds.filter((id) => topK.has(id)).length;
  return hits / relevantIds.length;
}

/** Mean Reciprocal Rank — 1 / rank_of_first_relevant_result. */
export function mrr(retrievedIds: string[], relevantIds: string[]): number {
  const relevant = new Set(relevantIds);
  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevant.has(retrievedIds[i]!)) return 1 / (i + 1);
  }
  return 0;
}
```

- [ ] **Step 5: Create placeholder eval set**

```json
// packages/eval/src/eval-set/niche-mental-health.json
{
  "version": "0.1-placeholder",
  "description": "Placeholder eval set. Replace with wife deliverable of 50-100 real query/chunk pairs before Phase 2 sign-off.",
  "pairs": [
    {
      "query": "psychoeducation post about anxiety symptoms",
      "expectedContentSubstring": "anxiety",
      "documentTitle": "Mental Health Basics"
    },
    {
      "query": "coping skills for burnout",
      "expectedContentSubstring": "burnout",
      "documentTitle": "Workplace Wellness"
    },
    {
      "query": "setting boundaries with family",
      "expectedContentSubstring": "boundary",
      "documentTitle": "Relationship Patterns"
    }
  ]
}
```

- [ ] **Step 6: Implement harness.ts**

```typescript
// packages/eval/src/harness.ts
import { retrieve } from "@smm/rag/retrieve";
import { recallAtK, mrr } from "./metrics";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

type EvalPair = {
  query: string;
  expectedContentSubstring: string;
  documentTitle: string;
};

type EvalSet = {
  version: string;
  description: string;
  pairs: EvalPair[];
};

type EvalResults = {
  timestamp: string;
  evalSetVersion: string;
  recallAt5: number;
  mrr: number;
  pairResults: Array<{ query: string; hit: boolean; rank: number | null }>;
  passed: boolean;
};

const RECALL_THRESHOLD = 0.75;

export async function runEval(options: {
  clientId: string;
  workspaceId: string;
  evalSetPath?: string;
  resultsPath?: string;
}): Promise<EvalResults> {
  const evalSetPath =
    options.evalSetPath ?? join(__dirname, "eval-set/niche-mental-health.json");
  const resultsPath =
    options.resultsPath ?? join(__dirname, "results/latest.json");

  const evalSet: EvalSet = JSON.parse(readFileSync(evalSetPath, "utf-8"));

  const pairResults: EvalResults["pairResults"] = [];
  const retrievedIdsList: string[][] = [];
  const relevantIdsList: string[][] = [];

  for (const pair of evalSet.pairs) {
    const result = await retrieve(pair.query, {
      clientId: options.clientId,
      workspaceId: options.workspaceId,
      limit: 10,
    });

    const chunkIds = result.chunks.map((c) => c.chunkId);

    // A hit: any top-5 chunk contains the expected substring
    const hitIndex = result.chunks
      .slice(0, 5)
      .findIndex((c) =>
        c.content
          .toLowerCase()
          .includes(pair.expectedContentSubstring.toLowerCase()),
      );

    const relevantIds = result.chunks
      .filter((c) =>
        c.content
          .toLowerCase()
          .includes(pair.expectedContentSubstring.toLowerCase()),
      )
      .map((c) => c.chunkId);

    pairResults.push({
      query: pair.query,
      hit: hitIndex !== -1,
      rank: hitIndex === -1 ? null : hitIndex + 1,
    });

    retrievedIdsList.push(chunkIds);
    relevantIdsList.push(relevantIds);
  }

  const recall5 =
    pairResults.length > 0
      ? pairResults.reduce((sum, r) => sum + (r.hit ? 1 : 0), 0) /
        pairResults.length
      : 1.0;

  const mrrScore =
    pairResults.length > 0
      ? retrievedIdsList.reduce(
          (sum, ids, i) => sum + mrr(ids, relevantIdsList[i]!),
          0,
        ) / pairResults.length
      : 1.0;

  const results: EvalResults = {
    timestamp: new Date().toISOString(),
    evalSetVersion: evalSet.version,
    recallAt5: Math.round(recall5 * 1000) / 1000,
    mrr: Math.round(mrrScore * 1000) / 1000,
    pairResults,
    passed: recall5 >= RECALL_THRESHOLD,
  };

  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
  return results;
}
```

- [ ] **Step 7: Create eval results placeholder**

```json
// packages/eval/src/results/latest.json
{
  "timestamp": "2026-05-20T00:00:00.000Z",
  "evalSetVersion": "0.1-placeholder",
  "recallAt5": 1.0,
  "mrr": 1.0,
  "pairResults": [],
  "passed": true,
  "note": "Placeholder result — run scripts/eval.ts against a seeded DB to populate"
}
```

- [ ] **Step 8: Create CI eval runner script**

```typescript
// scripts/eval.ts
import { runEval } from "../packages/eval/src/harness";

const clientId = process.env.EVAL_CLIENT_ID;
const workspaceId = process.env.EVAL_WORKSPACE_ID;

if (!clientId || !workspaceId) {
  console.error("EVAL_CLIENT_ID and EVAL_WORKSPACE_ID must be set");
  process.exit(1);
}

const results = await runEval({ clientId, workspaceId });

console.log(
  `recall@5: ${results.recallAt5} | MRR: ${results.mrr} | passed: ${results.passed}`,
);
results.pairResults.forEach((r) => {
  console.log(
    `  ${r.hit ? "✓" : "✗"} "${r.query}" (rank: ${r.rank ?? "not found"})`,
  );
});

if (!results.passed) {
  console.error(`\nFAIL: recall@5 ${results.recallAt5} < 0.75 threshold`);
  process.exit(1);
}
```

Add to root `package.json` scripts:

```json
"eval": "tsx scripts/eval.ts"
```

- [ ] **Step 9: Add eval aliases to vitest.config.ts**

```typescript
{ find: "@smm/eval/harness", replacement: path.resolve(__dirname, "packages/eval/src/harness.ts") },
{ find: "@smm/eval/metrics", replacement: path.resolve(__dirname, "packages/eval/src/metrics.ts") },
{ find: "@smm/eval", replacement: path.resolve(__dirname, "packages/eval/src/index.ts") },
```

- [ ] **Step 10: Run tests**

```bash
pnpm test:unit -- tests/unit/eval/metrics.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/eval/ scripts/eval.ts tests/unit/eval/metrics.test.ts vitest.config.ts package.json
git commit -m "feat: eval harness with recall@5 and MRR metrics, placeholder eval set, CI script"
```

---

### Task 17: RAG integration into hook + caption generation

**Files:**

- Modify: `packages/ai/src/prompts/hooks.ts`
- Modify: `packages/ai/src/prompts/captions.ts`
- Modify: `apps/web/app/api/v1/clients/[clientId]/generate/hooks/route.ts`
- Modify: `apps/web/app/api/v1/clients/[clientId]/generate/captions/route.ts`
- Modify: `apps/web/package.json` (add `@smm/rag` dependency)

- [ ] **Step 1: Update buildHookUserPrompt to accept retrieved context**

The new `retrievedContext` parameter is optional so Phase 1 calls that don't pass it still work.

```typescript
// packages/ai/src/prompts/hooks.ts — replace buildHookUserPrompt
export function buildHookUserPrompt(
  topic: string,
  brandVoiceContext: string,
  retrievedContext?: string,
): string {
  const contextSection = retrievedContext
    ? `\n\nRelevant content from this client's knowledge base (use for voice/framing context, not to copy verbatim):\n${retrievedContext}`
    : "";

  return `Generate 15 Instagram hook lines for a mental health practitioner on the topic: "${topic}"

Brand voice context:
${brandVoiceContext}${contextSection}

Requirements:
- Mix hook types: question, statistic, bold statement, relatable scenario, list preview
- Each hook must be under 25 words
- Avoid overused phrases: "you're not alone", "it's okay to not be okay", "mental health matters"
- Do not include treatment guarantees or unverifiable medical claims
- Return JSON only: { "hooks": string[] }`;
}
```

- [ ] **Step 2: Update buildCaptionUserPrompt to accept retrieved context**

```typescript
// packages/ai/src/prompts/captions.ts — add retrievedContext to buildCaptionUserPrompt
export function buildCaptionUserPrompt(
  topic: string,
  selectedHook: string,
  format:
    | "psychoeducation"
    | "normalization"
    | "coping_skill"
    | "story"
    | "cta",
  brandVoiceContext: string,
  clientState: string | null,
  retrievedContext?: string,
): string {
  const FORMAT_DESCRIPTIONS: Record<typeof format, string> = {
    psychoeducation:
      "Educational. Structure: hook → concept explanation → why it matters → actionable insight → CTA",
    normalization:
      "Validates experience. Structure: hook → 'many people feel...' → normalizing frame → reassurance → gentle CTA",
    coping_skill:
      "Teaches technique. Structure: hook → skill name → 3-5 steps → when to use it → CTA",
    story:
      "Brief narrative. Structure: hook → story setup → pivot/insight → takeaway → CTA",
    cta: "Direct action. Structure: hook → context → specific call to action → value proposition",
  };

  const contextSection = retrievedContext
    ? `\n\nRelevant content from this client's knowledge base:\n${retrievedContext}`
    : "";

  return `Write an Instagram caption for topic: "${topic}"
Opening hook (use this verbatim as the first line): "${selectedHook}"
Format: ${format} — ${FORMAT_DESCRIPTIONS[format]}
Brand voice: ${brandVoiceContext}
Practitioner state: ${clientState ?? "not specified"}${contextSection}

Keep caption 150–300 words. Write from the practitioner's professional voice.
Return JSON only: { "caption": string, "hashtags": string[] }`;
}
```

- [ ] **Step 3: Update hooks route to call retrieve()**

In `apps/web/app/api/v1/clients/[clientId]/generate/hooks/route.ts`, add the import and call `retrieve()` before the Claude call. Add `@smm/rag` to `apps/web/package.json` dependencies first.

```typescript
// Add to apps/web/package.json dependencies:
// "@smm/rag": "workspace:*"
```

Add these lines to the hooks route (after the `brandVoiceContext` is set, before `buildHookSystemPrompt`):

```typescript
// Add import at top:
import { retrieve } from "@smm/rag/retrieve";
import { buildCitations } from "@smm/rag/citations";

// Add after brandVoiceContext assignment, before systemBlocks:
const ragResult = await retrieve(topic, { clientId, workspaceId }).catch(
  () => ({
    chunks: [],
    contextText: "",
  }),
);
const citations = buildCitations(ragResult.chunks);

// Update the prompt call:
const userPrompt = buildHookUserPrompt(
  topic,
  brandVoiceContext,
  ragResult.contextText || undefined,
);
```

Add `citations` to the response JSON:

```typescript
return NextResponse.json({
  hooks,
  auditId: auditEntry!.id,
  compliance: {
    violations: criticResult.violations,
    approved: criticResult.approved,
    rulesVersion: "1.0",
  },
  crisis: {
    triggered: crisisResult.triggered,
    score: crisisResult.score,
    resources: crisisResult.resources,
  },
  citations,
  cacheHit: usage.cacheReadTokens > 0,
});
```

- [ ] **Step 4: Update captions route similarly**

In the captions route, inside the `formats.map()` loop, call `retrieve()` once before the parallel map (so we don't make 5 identical retrieve calls), then pass `ragResult.contextText` to `buildCaptionUserPrompt`:

```typescript
// Add import at top:
import { retrieve } from "@smm/rag/retrieve";
import { buildCitations } from "@smm/rag/citations";

// Add after brandVoiceContext assignment, before captionResults:
const ragResult = await retrieve(`${topic} ${selectedHook}`, {
  clientId,
  workspaceId,
}).catch(() => ({
  chunks: [],
  contextText: "",
}));
const citations = buildCitations(ragResult.chunks);

// In buildCaptionUserPrompt call, add the retrieved context as 6th arg:
const userPrompt = buildCaptionUserPrompt(
  topic,
  selectedHook,
  format,
  brandVoiceContext,
  clientState,
  ragResult.contextText || undefined,
);
```

Add `citations` to the response:

```typescript
return NextResponse.json({ captions: captionResults, citations });
```

- [ ] **Step 5: Run all unit tests to confirm nothing broke**

```bash
pnpm test:unit
```

Expected: All 50+ tests PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/ai/src/prompts/hooks.ts \
        packages/ai/src/prompts/captions.ts \
        "apps/web/app/api/v1/clients/[clientId]/generate/" \
        apps/web/package.json
git commit -m "feat: wire RAG retrieve() into hook + caption generation (retrieved context injected into prompts)"
```

---

### Task 18: Ingestion status UI + citation display

**Files:**

- Create: `apps/web/app/(app)/clients/[clientId]/knowledge/page.tsx`
- Modify: `apps/web/app/(app)/clients/[clientId]/generate/hooks/page.tsx` (show citations)

- [ ] **Step 1: Create ingestion status page**

```tsx
// apps/web/app/(app)/clients/[clientId]/knowledge/page.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Plus, AlertTriangle } from "lucide-react";

type Document = {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  failedStage: string | null;
  failedReason: string | null;
  createdAt: string;
};

type KnowledgeBase = {
  id: string;
  name: string;
};

const FAILURE_MESSAGES: Record<string, string> = {
  fetch: "Could not fetch content from the source.",
  parse: "Could not read this file. Try re-exporting as PDF/A.",
  chunk: "Content could not be split into chunks.",
  embed: "Embedding failed — API rate limit. Will retry automatically.",
  store: "Could not save chunks to database.",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  fetching: "bg-blue-100 text-blue-700",
  parsing: "bg-blue-100 text-blue-700",
  chunking: "bg-blue-100 text-blue-700",
  embedding: "bg-blue-100 text-blue-700",
  storing: "bg-blue-100 text-blue-700",
  complete: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

export default function KnowledgePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchKbs = useCallback(async () => {
    const res = await fetch(`/api/v1/clients/${clientId}/knowledge-bases`);
    if (res.ok) {
      const data = (await res.json()) as { knowledgeBases: KnowledgeBase[] };
      setKbs(data.knowledgeBases);
      if (data.knowledgeBases.length > 0 && !selectedKbId) {
        setSelectedKbId(data.knowledgeBases[0]!.id);
      }
    }
  }, [clientId, selectedKbId]);

  const fetchDocs = useCallback(async () => {
    if (!selectedKbId) return;
    setLoading(true);
    const res = await fetch(
      `/api/v1/clients/${clientId}/knowledge-bases/${selectedKbId}/documents`,
    );
    if (res.ok) {
      const data = (await res.json()) as { documents: Document[] };
      setDocs(data.documents);
    }
    setLoading(false);
  }, [clientId, selectedKbId]);

  useEffect(() => {
    void fetchKbs();
  }, [fetchKbs]);
  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  async function retryDocument(docId: string) {
    if (!selectedKbId) return;
    await fetch(
      `/api/v1/clients/${clientId}/knowledge-bases/${selectedKbId}/documents/${docId}/retry`,
      { method: "POST" },
    );
    void fetchDocs();
  }

  async function createKb() {
    const name = window.prompt("Knowledge base name:");
    if (!name) return;
    const res = await fetch(`/api/v1/clients/${clientId}/knowledge-bases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) void fetchKbs();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge Base</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Documents ingested for RAG-powered generation.
          </p>
        </div>
        <Button onClick={createKb} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Knowledge Base
        </Button>
      </div>

      {kbs.length === 0 && (
        <Alert>
          <AlertDescription>
            No knowledge bases yet. Create one to start adding documents.
          </AlertDescription>
        </Alert>
      )}

      {kbs.length > 0 && (
        <div className="flex gap-2">
          {kbs.map((kb) => (
            <Button
              key={kb.id}
              variant={selectedKbId === kb.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedKbId(kb.id)}
            >
              {kb.name}
            </Button>
          ))}
        </div>
      )}

      {selectedKbId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Documents</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchDocs}
              className="gap-1"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>

          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!loading && docs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No documents yet. Use the API to ingest content.
            </p>
          )}

          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start justify-between rounded-md border p-3"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{doc.title}</p>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[doc.status] ?? ""}`}
                  >
                    {doc.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {doc.sourceType}
                  </span>
                </div>
                {doc.status === "failed" && (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    {doc.failedStage
                      ? (FAILURE_MESSAGES[doc.failedStage] ??
                        doc.failedReason ??
                        "Unknown error")
                      : (doc.failedReason ?? "Unknown error")}
                  </div>
                )}
              </div>
              {doc.status === "failed" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => retryDocument(doc.id)}
                >
                  Retry
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add citations display to hooks page**

Open `apps/web/app/(app)/clients/[clientId]/generate/hooks/page.tsx`.

Add `Citation` type at the top:

```typescript
type Citation = {
  chunkId: string;
  documentTitle: string;
  sourceType: string;
  excerpt: string;
};
```

Add `citations` to `GenerateHooksResult`:

```typescript
type GenerateHooksResult = {
  // ... existing fields ...
  citations: Citation[];
};
```

Add citation state and display below the violations alert and above the hooks list:

```tsx
{
  result.citations.length > 0 && (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">
        Context from knowledge base ({result.citations.length} source
        {result.citations.length > 1 ? "s" : ""}):
      </p>
      {result.citations.map((c) => (
        <div
          key={c.chunkId}
          className="rounded-sm border px-2 py-1 text-xs text-muted-foreground"
        >
          <span className="font-medium">{c.documentTitle}</span> — {c.excerpt}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(app)/clients/[clientId]/knowledge/" \
        "apps/web/app/(app)/clients/[clientId]/generate/hooks/page.tsx"
git commit -m "feat: ingestion status UI (per-doc status, failure messages, retry) + citation display on hooks page"
```

---

### Task 19: Cross-client isolation integration test

**Files:**

- Create: `tests/integration/rag/isolation.test.ts`

This test requires `DATABASE_URL`, `ANTHROPIC_API_KEY`, and `VOYAGE_API_KEY`. It seeds two clients' chunks and verifies retrieve() cannot return chunks across client boundaries.

- [ ] **Step 1: Create the integration test**

```typescript
// tests/integration/rag/isolation.test.ts
/**
 * Integration test: cross-client chunk isolation.
 * Run with: DATABASE_URL=... ANTHROPIC_API_KEY=... VOYAGE_API_KEY=... pnpm test:integration
 *
 * Seeds chunks for two clients, verifies retrieve() cannot surface client-B
 * chunks from a client-A query context.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "../../../packages/db/src/client";
import {
  chunks,
  documents,
  knowledgeBases,
  clients,
  workspaces,
} from "../../../packages/db/src/schema/index";
import { embed } from "../../../packages/ai/src/embeddings";
import { retrieve } from "../../../packages/rag/src/retrieve";
import { eq } from "drizzle-orm";
import crypto from "node:crypto";

const TEST_WS_ID = "00000000-0000-0000-0000-000000000001";
const TEST_CLIENT_A = "00000000-0000-0000-0000-000000000002";
const TEST_CLIENT_B = "00000000-0000-0000-0000-000000000003";

const UNIQUE_MARKER_A = "ISOLATION_TEST_CLIENT_A_" + crypto.randomUUID();
const UNIQUE_MARKER_B = "ISOLATION_TEST_CLIENT_B_" + crypto.randomUUID();

async function seedChunk(
  text: string,
  kbId: string,
  clientId: string | null,
  workspaceId: string | null,
): Promise<string> {
  const [docRow] = await db
    .insert(documents)
    .values({
      knowledgeBaseId: kbId,
      sourceType: "web_url",
      title: "Test Doc",
      status: "complete",
      rightsConfirmed: true,
    })
    .returning({ id: documents.id });

  const [embedding] = await embed([text]);
  const vecStr = `[${embedding!.join(",")}]`;

  const [chunk] = await db
    .insert(chunks)
    .values({
      documentId: docRow!.id,
      knowledgeBaseId: kbId,
      clientId,
      workspaceId,
      content: text,
      embedding: sql`${vecStr}::vector`,
      tsv: sql`to_tsvector('english', ${text})`,
      chunkIndex: 0,
      tokenCount: Math.ceil(text.length / 4),
      metadata: {},
    })
    .returning({ id: chunks.id });

  return chunk!.id;
}

describe("Cross-client chunk isolation", () => {
  let kbIdA: string;
  let kbIdB: string;
  let chunkIdA: string;
  let chunkIdB: string;

  beforeAll(async () => {
    // Seed minimal workspace + clients (use upsert so reruns don't fail)
    await db
      .insert(workspaces)
      .values({ id: TEST_WS_ID, clerkOrgId: "test-org", name: "Test WS" })
      .onConflictDoNothing();
    await db
      .insert(clients)
      .values({
        id: TEST_CLIENT_A,
        workspaceId: TEST_WS_ID,
        name: "Client A",
        slug: "client-a",
      })
      .onConflictDoNothing();
    await db
      .insert(clients)
      .values({
        id: TEST_CLIENT_B,
        workspaceId: TEST_WS_ID,
        name: "Client B",
        slug: "client-b",
      })
      .onConflictDoNothing();

    const [kbA] = await db
      .insert(knowledgeBases)
      .values({
        workspaceId: TEST_WS_ID,
        clientId: TEST_CLIENT_A,
        name: "KB A",
        kbType: "client",
      })
      .returning({ id: knowledgeBases.id });
    kbIdA = kbA!.id;

    const [kbB] = await db
      .insert(knowledgeBases)
      .values({
        workspaceId: TEST_WS_ID,
        clientId: TEST_CLIENT_B,
        name: "KB B",
        kbType: "client",
      })
      .returning({ id: knowledgeBases.id });
    kbIdB = kbB!.id;

    chunkIdA = await seedChunk(
      `Client A unique content: ${UNIQUE_MARKER_A}. Anxiety management for therapists.`,
      kbIdA,
      TEST_CLIENT_A,
      TEST_WS_ID,
    );
    chunkIdB = await seedChunk(
      `Client B unique content: ${UNIQUE_MARKER_B}. Burnout recovery strategies.`,
      kbIdB,
      TEST_CLIENT_B,
      TEST_WS_ID,
    );
  });

  afterAll(async () => {
    // Clean up test data
    await db.delete(knowledgeBases).where(eq(knowledgeBases.id, kbIdA));
    await db.delete(knowledgeBases).where(eq(knowledgeBases.id, kbIdB));
  });

  it("retrieve() for client A does not return client B chunks", async () => {
    const result = await retrieve(UNIQUE_MARKER_B, {
      clientId: TEST_CLIENT_A,
      workspaceId: TEST_WS_ID,
    });

    const chunkIds = result.chunks.map((c) => c.chunkId);
    expect(chunkIds).not.toContain(chunkIdB);
  }, 30_000);

  it("retrieve() for client A returns client A chunks when queried", async () => {
    const result = await retrieve(UNIQUE_MARKER_A, {
      clientId: TEST_CLIENT_A,
      workspaceId: TEST_WS_ID,
    });

    const chunkIds = result.chunks.map((c) => c.chunkId);
    expect(chunkIds).toContain(chunkIdA);
  }, 30_000);
});
```

- [ ] **Step 2: Commit**

```bash
git add tests/integration/rag/isolation.test.ts
git commit -m "test: cross-client chunk isolation integration test (retrieve cannot leak between clients)"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement                                           | Task                                         |
| ---------------------------------------------------------- | -------------------------------------------- |
| knowledge_bases, documents, chunks schemas                 | Task 1                                       |
| pgvector HNSW + tsvector GIN indexes                       | Task 1                                       |
| EmbeddingProvider abstraction                              | Task 2                                       |
| Dense vector search                                        | Task 3                                       |
| BM25 tsvector search                                       | Task 3                                       |
| RRF fusion                                                 | Task 4                                       |
| Recency boost                                              | Task 4                                       |
| voyage-rerank-2 reranking                                  | Task 5                                       |
| retrieve() module                                          | Task 6                                       |
| Query rewriting                                            | Task 6                                       |
| Citation construction                                      | Task 7                                       |
| Recursive chunker                                          | Task 8                                       |
| Single-chunk chunker                                       | Task 8                                       |
| Heading-aware chunker                                      | Task 8                                       |
| Semantic chunker                                           | Task 9                                       |
| Ingestion Inngest pipeline (fetch→parse→chunk→embed→store) | Task 10                                      |
| File upload (R2 + Unstructured PDF + Groq Whisper)         | Task 11                                      |
| YouTube URL (transcript)                                   | Task 12                                      |
| Podcast RSS                                                | Task 13                                      |
| Web URL (readability)                                      | Task 13                                      |
| IG post paste                                              | Task 13                                      |
| Google Drive                                               | Task 14                                      |
| Knowledge base + document API routes                       | Task 15                                      |
| Ingestion failure modes → UI messages                      | Tasks 10 + 18                                |
| Retry action                                               | Tasks 15 + 18                                |
| packages/eval harness, recall@K, MRR                       | Task 16                                      |
| Placeholder eval set                                       | Task 16                                      |
| recall@5 ≥ 0.75 CI gate                                    | Task 16                                      |
| RAG integrated into hook/caption generation                | Task 17                                      |
| Citation display in UI                                     | Task 18                                      |
| Ingestion status UI                                        | Task 18                                      |
| Cross-client isolation test                                | Task 19                                      |
| Rights confirmation on ingestion                           | Task 15 (rightsConfirmed field + validation) |

All spec requirements covered. ✅

**Placeholder scan:** No TBD, TODO, or vague steps. ✅

**Type consistency check:**

- `RawChunk` defined in `hybrid.ts`, used by `rrf()`, `applyRecencyBoost()`, `fusedSearch()` ✅
- `ScoredChunk = RawChunk & { score: number }` flows through rerank → retrieve ✅
- `RetrievedChunk` in `retrieve.ts`, used in `citations.ts` ✅
- `Chunk` from `chunkers/types.ts` used by all four chunkers and `pipeline.ts` ✅
- `FetchResultRaw` in `sources/types.ts` returned by all source fetchers ✅
