# Phase 2 ingestion review — deferred follow-ups

Generated 2026-05-27 from the iterative-review of `packages/ingestion` (commit c7cc3c9).
This loop fixed 11 CRITICAL/HIGH findings inline. The items below were
intentionally deferred because they touch other packages, require a
DB migration, or fall below the in-loop threshold.

## Out-of-scope CRITICAL discovered during review

### IG OAuth state has the same CSRF vulnerability that C1 fixed for Drive

- File: `apps/web/app/api/v1/clients/[clientId]/instagram/connect/oauth-state.ts`
- Severity: **CRITICAL** (matches C1)
- Status: NOT FIXED — out of this loop's scope (`packages/ingestion`), but
  the patch is identical to the one applied to the Drive `oauth-state.ts`
  in this loop. Recommend porting the HMAC sign/verify helper and applying
  it to the IG flow before any production launch.
- Suggested fix: lift `sign()` / `safeReturnTo()` into a shared
  `apps/web/lib/oauth-state.ts` and have both Drive and IG import from
  there. Update the existing `tests/unit/api/ig-oauth-state.test.ts` to
  assert the signed format.

## Architectural HIGH findings deferred (originally H7, H8)

### H7 — Embed stage is non-idempotent under Inngest retries

- File: `packages/ingestion/src/pipeline.ts:128-152`
- Source: architect reviewer (confidence 90)
- Cost shape: every Inngest retry re-embeds the full document. Voyage
  charges per token; a flaky store stage burns 3x the budget on every
  failed document.
- Two implementation paths (pick one):
  1. **Decompose into `step.run()` boundaries.** Move the embed call
     into its own Inngest step inside `packages/inngest/src/functions/ingest.ts`.
     Inngest memoizes step results across attempts, so retries skip work
     already completed. This is the architecturally correct fix; it also
     gives finer-grained visibility into which stage actually failed.
     Effort: ~2 days. Touches `@smm/inngest` and the pipeline contract.
  2. **Content-hash cache.** Add a `chunks.content_hash` column
     (sha256 of `chunk.content`). Before embedding, look up existing
     rows for `(documentId, content_hash)`; skip the Voyage call for
     hits. Effort: ~half a day. Migration + a query helper.
- Recommendation: option 1 — the step-boundary approach also makes the
  pipeline observable in the Inngest UI per stage, which is generally
  useful.

### H8 — `documentStatusEnum` includes `"parsing"` which is never written

- File: `packages/db/src/schema/documents.ts:20-29` vs
  `packages/ingestion/src/pipeline.ts:85-86`
- Source: architect reviewer (confidence 95)
- Effort: small migration + drizzle-kit regenerate.
- Pick one:
  1. **Drop `"parsing"` from the enum.** Simpler. The status currently
     reads `"chunking"` during what is actually the parse step inside
     `file-upload.ts`'s Unstructured call, which is fine — parsing is an
     implementation detail of the fetch stage.
  2. **Split the chunk stage into explicit `"parsing"` + `"chunking"` writes.**
     Truer to the original enum intent. Requires moving the Unstructured
     parse out of `fetchFileUpload` and into a separate pipeline stage.
- Recommendation: option 1 (drop the enum value).

## MEDIUM findings to track

### M1 — `semanticChunk` window overlap duplicates content across segments

- File: `packages/ingestion/src/chunkers/semantic.ts:71-77`
- Source: code-reviewer (confidence 82)
- `splitIntoWindows` uses 80%-stride overlapping windows; the boundary
  reconstruction in `rawSegments` doesn't account for the overlap, so
  consecutive segments share up to `WINDOW_WORDS - STRIDE_WORDS` (~82
  words) of text. This duplicates content in the KB and means the same
  passage can be retrieved twice for a single query.
- Fix: reconstruct segments from non-overlapping word ranges
  (`wordCursor` style), not from window indices times stride.

### M2 — `singleChunk` should filter whitespace-only posts defensively

- File: `packages/ingestion/src/chunkers/single-chunk.ts:8-16`
- Source: code-reviewer (confidence 78)
- Current `fetchIgPosts` filters `length >= 10`, so this is masked. But
  `singleChunk` is a public export; future callers may not filter. Add
  `.filter((content) => content.length > 0)` after the trim.

### M3 — Chunker dispatch couples on `sourceType` × optional-field shape

- File: `packages/ingestion/src/pipeline.ts:96-114`
- Source: architect (confidence 88)
- The pipeline picks a chunker based on `doc.sourceType` AND the
  presence/absence of optional fields on `FetchResultRaw` (`elements`,
  `posts`). A future DOCX upload that returns elements would route
  correctly only by luck.
- Fix: convert `FetchResultRaw` to a discriminated union
  (`kind: "plain" | "elements" | "posts" | "transcript"`); pipeline
  switches on `result.kind`, not on `sourceType`.

### M4 — `index.ts` public surface omits subpaths that `package.json` exports

- Files: `packages/ingestion/src/index.ts:1`,
  `packages/ingestion/package.json:6-20`
- Source: architect (confidence 90)
- `src/index.ts` exports only `runIngestionPipeline`, but
  `package.json` exposes 12 subpaths (chunkers, sources). Pick a stance:
  either keep the package narrow (drop the subpath exports, use Vitest
  aliases for tests) or document each subpath as public surface.
- Recommendation: keep narrow. The Inngest function only needs
  `@smm/ingestion/pipeline`.

## LOW findings to track

### L1 — Module-level `SOURCE_FETCHERS` registry is mutable from outside

- File: `packages/ingestion/src/pipeline.ts:25-31`
- Source: code-reviewer (confidence 76)
- `registerSourceFetcher` is exported. Tests that call it leak into
  production state. Either seal the registry after module-init or make
  the register API development-only.

### L2 — `refreshAccessToken` discards Google's error body

- File: `packages/ingestion/src/sources/google-drive-token.ts:39-43`
- Source: security-reviewer (confidence 80)
- Wraps the body in `await res.text().catch(() => "")` and include in
  the thrown error for debuggability. Distinguishes `invalid_grant`
  (revoked — user action needed) from transient 5xx (retry).

### L3 — `podcast-rss.ts` duplicates content per item

- File: `packages/ingestion/src/sources/podcast-rss.ts:22-27`
- Source: code-reviewer (confidence 76)
- `rss-parser` sets `contentSnippet` to a stripped version of `content`.
  Adding both doubles the token count. Use `contentSnippet ?? content`.

### L4 — Cross-process refresh race remaining

- File: `packages/ingestion/src/sources/google-drive-token.ts`
- This loop added in-process Promise dedup for `getDriveAccessToken`
  (handles concurrent calls within one Vercel/Inngest worker). The
  cross-process case (two workers refreshing the same token simultaneously)
  is still possible. Full fix needs either:
  1. Switch to `drizzle-orm/neon-serverless` (WebSocket driver) so we can
     `SELECT ... FOR UPDATE` inside a transaction; OR
  2. Add a `workspace_integrations.refresh_lock` timestamp column and use
     a conditional UPDATE as a poor-man's lock.
- Real-world probability is low; defer until a billing-cycle telemetry
  signal suggests it's hitting.
