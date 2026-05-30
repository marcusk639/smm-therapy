# Audit Working Notes — 2026-05-27

Project: smm-therapy
User question: "what needs to be done in order to be ready for launch"

## Phase 1 — Territory Map

### Top-level

- `apps/web` — single Next.js 15 app
- `packages/` — 11 packages: ai, compliance, crypto, db, eval, features, ingestion, inngest, notifications, rag, storage, types
- `tools/scraper-cli` — Playwright scraper (out-of-product, personal use)
- `scripts/` — setup + eval CLI
- `services/` — empty (deleted? need to verify) — but referenced for Docker / Unstructured in spec
- `docs/superpowers/{specs,plans}` — locked spec (1031 LOC) + 8 phase plans + 2 tool plans + 1 followups doc just written
- `docs/manual-tasks/2026-05-21-post-implementation-setup.md` — operations runbook (419 LOC)
- `tests/{unit,integration}` — Vitest

### Volume

- ~236 TS files in monorepo
- apps/web: 65 .ts/.tsx
- Total doc lines: ~20,805

### Recent commits (top)

- 4edc3f9 — docs: claude memory hierarchy
- c7cc3c9 — phase 2 ingestion ig_posts + drive + workspace fixes (the just-reviewed work)
- 42238a8 — notifications, marketing
- 0b698b9 — fix all P0/P1 review findings from roadmap audit (! — there was a prior roadmap audit)
- 8a586b4 — implement 8 missing features from spec audit (! — there was a prior spec audit)
- 38181c3 — fix: rename proxy.ts to middleware.ts so Clerk auth enforcement actually runs (CRITICAL: the runbook still references proxy.ts)

### No TODO/FIXME markers in code

Either disciplined cleanup or never written. Slight skew toward optimism.

## Phase 1 — Layer Map

| Layer                                             | Files                                             | Strategy                       |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------ |
| Configuration                                     | turbo.json, tsconfig, vitest.config, .env.example | Skim                           |
| DB schema                                         | 21 tables in packages/db/src/schema               | Read myself (auth)             |
| Type Zod schemas                                  | packages/types                                    | Light explorer                 |
| Service/data layer (LLM/embed/rag/storage/crypto) | packages/{ai,rag,compliance,storage,crypto}       | Explorer 2                     |
| Workflows                                         | packages/inngest, ingestion                       | Explorer 3                     |
| API routes + UI                                   | apps/web/{app,components,lib}                     | Explorer 1 (biggest)           |
| Tests                                             | tests/{unit,integration}                          | Cross-reference during Phase 3 |
| Tools                                             | tools/scraper-cli                                 | Light explorer                 |
| Docs                                              | docs/{specs,plans,manual-tasks}                   | Read myself Phase 2            |

## Phase 1 — Db Schema (read by main agent)

21 tables, comprehensive:

- workspaces (plan enum: starter/growth/agency)
- users + workspace_members
- clients (practiceState, primaryCredential enum: LCSW/LMFT/LPC/PsyD/PhD/MD/Other, instagramHandle, branding)
- compliance_rules (ruleType: prohibition/requirement/warning)
- generation_audit (generationType: hooks/captions/calendar/repurpose)
- brand_voices (per-client jsonb profile)
- drafts (draftStatus: draft→ready_for_client→client_reviewing→approved/changes_requested→scheduled→published) + draft_status_history
- disclaimer_templates (per content type)
- llm_usage_log (model, prompt/completion/cache tokens, call_type)
- knowledge_bases (kbType: client/shared_niche; workspaceId NULL for shared)
- documents (sourceType: file_upload/youtube_url/podcast_rss/google_drive/web_url/ig_posts)
- chunks (vector(1024) + tsvector, unique on documentId+chunkIndex)
- calendar_jobs
- magic_link_tokens (portal)
- instagram_tokens (encrypted, per-client, separate from workspace_integrations)
- trend_topics (weekOf date, subreddit + RSS sources)
- stripe_subscriptions (per-workspace, stripeCustomerId unique)
- rate_limit_hits (Postgres-backed; NOTE — spec says Upstash, code uses Postgres)
- workspace_integrations (provider enum: only google_drive currently)

## Phase 1 — Files & Conventions

- Imports use `@smm/<package>[/<subpath>]`
- Path alias `@/*` from `apps/web/`
- Workspace scoping is application-level (not RLS) per `.claude/rules/workspace-scoping.md`
- OAuth token encryption: per-provider key (drive vs instagram have separate env keys)
- `apps/web/AGENTS.md` warns that this is Next.js 15 with breaking changes from training data

## Background work in flight

- Explorer 1: apps/web routes + components (af4a486a640484e0d)
- Explorer 2: ai + rag + compliance + eval (a80de1a2024d1cb3c)
- Explorer 3: inngest + notifications (ad115a5e440a49ae2)
- Explorer 4: types + features + storage + crypto + scraper-cli + scripts (a388997f98228b691)

## Phase 1 — Pre-emptive findings (from incidental reads)

### Stale runbook

docs/manual-tasks/2026-05-21-post-implementation-setup.md Section 6 references `apps/web/proxy.ts` for Clerk middleware. Commit 38181c3 renamed proxy.ts → middleware.ts. The runbook is at least one critical step stale.

### Missing env vars in runbook

The runbook lists 17 env vars but does NOT include:

- `GOOGLE_DRIVE_CLIENT_ID`
- `GOOGLE_DRIVE_CLIENT_SECRET`
- `GOOGLE_DRIVE_TOKEN_KEY`
- `OAUTH_STATE_SECRET` (newly added in just-completed iterative review)

These are now required for the google_drive ingestion source — which is listed in the locked spec as one of 6 source types.

### IG OAuth CSRF vulnerability (CRITICAL)

The just-completed iterative-review fixed an HMAC-signing vulnerability in the Google Drive OAuth state. The Instagram OAuth state at `apps/web/app/api/v1/clients/[clientId]/instagram/connect/oauth-state.ts` has the SAME unsigned base64url pattern. The test at `tests/unit/api/ig-oauth-state.test.ts` actually asserts this unsigned format. **Documented as CRITICAL in `docs/superpowers/plans/2026-05-27-phase-2-review-followups.md` — but not yet fixed.**

### Pre-existing typecheck noise (from project CLAUDE.md note)

- `packages/inngest/src/functions/monthly-reports.tsx`
- `packages/inngest/src/functions/calendar-generate.ts`
- `packages/inngest/src/functions/trend-sync.ts`

Need to assess whether these errors prevent the functions from running at runtime, or are only build-time noise.

### Spec/code divergences spotted

- Rate limiting: spec says Upstash Redis; code uses Postgres-backed `rate_limit_hits` table
- Spec lists Twilio for SMS; not mentioned in recent docs; need to verify implementation
- Spec mentions `packages/reports` (React-PDF); actual code has reports under `packages/inngest/src/functions/monthly-reports.tsx`

### Stripe API version mismatch (from earlier typecheck)

`apps/web/lib/stripe.ts` line 8: `apiVersion: "2025-04-30.basil"` doesn't match the installed Stripe SDK which expects `2026-04-22.dahlia`. Webhook handler accesses `sub.current_period_end` which the new SDK doesn't expose at the top level. This will break webhooks at runtime, not just at build time.

### Stripe pricing

- Spec section 14 (line 999): Stripe pricing tiers should be decided before Phase 0 schema migration → already done in workspaces.ts plan enum: starter/growth/agency
- Phase 7 plan price IDs: $99/mo Growth, $299/mo Agency

### Legal blockers from spec

- ToS, Privacy Policy with HIPAA-adjacent disclaimer (Phase 7 dependency)
- HIPAA scope creep — spec marks as "Very High Impact" launch blocker if unresolved

### Meta App Review (spec risk #1)

- 4-6 week external timer
- High likelihood of first-submission rejection
- Without approval, Instagram publishing only works for accounts added as Testers
