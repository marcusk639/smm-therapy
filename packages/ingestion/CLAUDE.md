# @smm/ingestion

Source fetchers, chunkers, and the orchestration pipeline that turns a `documents` row into `chunks` rows.

## Layout

- `src/sources/` — one file per source type. Each exports a `Source​Fetcher` (`(doc) => Promise<FetchResultRaw>`).
- `src/chunkers/` — four chunkers: `recursive`, `single-chunk` (one input = one chunk, used for IG posts), `heading-aware` (Unstructured PDF element groups), `semantic` (embedding-similarity boundaries).
- `src/pipeline.ts` — `runIngestionPipeline(documentId)` orchestrator + the `SOURCE_FETCHERS` registry.
- `src/utils.ts` — `countTokens`, `splitAtTokenBoundary` (4 chars/token heuristic).

## Pipeline contract

`runIngestionPipeline(documentId)` walks the document through stages — `fetching → chunking → embedding → storing → complete` — writing the current stage to `documents.status` and, on error, capturing `failedStage` + `failedReason` before re-throwing.

The pipeline is invoked from the `ingestDocument` Inngest function (`packages/inngest/src/functions/ingest.ts`), which retries up to 3 times.

## Adding a new source type

1. Add the new type to the `sourceTypeEnum` in `packages/db/src/schema/documents.ts` and generate a migration.
2. Create `src/sources/<new>.ts` exporting an `async (doc) => Promise<FetchResultRaw>` function. If the fetcher needs side-channel data (an OAuth token, a workspace setting), load it inside the fetcher — do not widen the `SourceFetcher` signature.
3. Add `./sources/<new>` to the `exports` map in `package.json`.
4. Import and register in `src/pipeline.ts`:
   ```ts
   import { fetchNew } from "./sources/<new>";
   registerSourceFetcher("<new>", fetchNew);
   ```
5. Pick the right chunker in `pipeline.ts`'s parse-and-chunk stage. Default is `recursiveChunk`. Special cases:
   - `ig_posts` → `singleChunk` (each post = 1 chunk).
   - `file_upload` with PDF elements → `headingAwareChunk`.
   - `youtube_url` and `podcast_rss` → `semanticChunk` (transcripts have no natural paragraph breaks).
6. Add unit tests under `tests/unit/ingestion/`.

## Side-channel-data patterns

- `ig_posts` reads `doc.rawText` (a `text` column on `documents`).
- `google_drive` reads `doc.knowledgeBaseId → knowledgeBases.workspaceId → workspace_integrations.encrypted_access_token`, then refreshes if needed. See `src/sources/google-drive-token.ts`.

## Why this shape

Keeping `SourceFetcher` uniform `(doc) => Promise<FetchResultRaw>` lets the registry stay a flat map and the pipeline body stay short. Side-channel concerns live inside each fetcher, where the surrounding code makes the lookup obvious.
