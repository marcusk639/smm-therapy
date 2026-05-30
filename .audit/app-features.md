# smm-therapy — Code-Derived Feature Inventory

**Date:** 2026-05-27
**Source:** Codebase exploration of `apps/web` + 11 packages.
**State:** Pre-launch. Phases 0–7 implementation reportedly complete; verifying against code below.

## What the app does (one paragraph)

Multi-tenant SaaS automating Instagram content creation and client-handoff workflows for solo / small-team SMMs serving licensed mental health practitioners. The SMM logs in via Clerk (org = workspace), adds practitioner clients, ingests each client's content into a per-client RAG knowledge base, generates hooks + captions + content calendars grounded in that knowledge base, runs every generation through a compliance critic tuned to state/credential rules, sends approved drafts to a white-labeled client portal for therapist review, and publishes approved posts to Instagram. Billing via Stripe; weekly trend digests via Reddit + RSS; monthly PDF reports via React-PDF.

## Major feature domains

### 1. Authentication + multi-tenancy

- Clerk auth on `apps/web/middleware.ts`; public routes whitelisted (`/`, `/sign-in(.*)`, `/sign-up(.*)`, `/portal(.*)`, `/api/portal(.*)`, `/api/webhooks(.*)`)
- `requireWorkspace()` in `apps/web/lib/workspace.ts` derives `{ workspaceId, userId }` from Clerk session
- Tenant isolation enforced at application level via `workspaceFilter()` (not Postgres RLS — Neon PgBouncer transaction-mode incompatibility, documented in `packages/db/RLS.md`)
- Clerk webhook (`apps/web/app/api/webhooks/clerk/route.ts`) handles `organization.created` + `organization.updated`. Does NOT handle `organization.deleted`.

### 2. Client + workspace setup

- `/setup` onboarding wizard (`apps/web/app/(onboarding)/setup/page.tsx`): 3 steps — name workspace → first client → first knowledge base. No re-entry guard.
- Client list at `/clients`: STUB — placeholder text only. No CRUD UI.
- Client detail at `/clients/[id]`: NO PAGE — 404s.
- API: `/api/v1/clients` (GET/POST), `/api/v1/clients/[id]` (GET/PATCH/DELETE) exist and work.

### 3. Knowledge base / RAG

- 6 source types supported in code (`packages/ingestion/src/sources/`): `file_upload`, `youtube_url`, `podcast_rss`, `google_drive`, `web_url`, `ig_posts`.
- 4 chunkers: `recursive` (clean text), `single-chunk` (one IG post = one chunk), `heading-aware` (PDF elements), `semantic` (transcripts with embedding-similarity boundaries).
- Pipeline: `fetching → chunking → embedding → storing → complete` (per `packages/ingestion/src/pipeline.ts`); orchestrated by Inngest function `ingest-document` (3 retries).
- Per-Phase 2 review fix (commit c7cc3c9 + iterative-review 2026-05-27): chunk store is idempotent via upsert + orphan cleanup; soft-delete guard; semantic→recursive fallback on Voyage embed failure.
- Retrieval: `retrieve(query, { clientId, workspaceId })` in `packages/rag/src/retrieve.ts`. Pipeline: query-rewrite (Claude Haiku for ≤40 char queries) → embed → dense (pgvector) + BM25 (tsvector) in parallel → RRF fusion → recency boost (90-day half-life) → Voyage `voyage-rerank-2` → citations.
- Cross-client isolation: enforced in code + regression test at `tests/integration/rag/isolation.test.ts`.
- Knowledge UI at `/clients/[id]/knowledge`: PARTIAL — lists KBs/documents with retry, BUT no in-app file upload (says "Use the API"). API endpoints exist (`/upload-url`, `/documents`) but no UI consumes them.

### 4. Generation

- `/api/v1/clients/[id]/generate/hooks` — rate-limited 20/min/workspace, RAG-grounded, 15 hooks via Claude Haiku, compliance critic + crisis detection + audit row + llm_usage_log row. RAG failsafe rule applied.
- `/api/v1/clients/[id]/generate/captions` — same rate limit, 5 formats in parallel, compliance critic per format + disclaimer injection. **GAP: no crisis detection on captions; no generation audit row written.**
- Brand voice extraction at `/clients/[id]/brand-voice` — fully wired: posts samples → Claude extracts structured profile (`tone`, `vocabularyLevel`, `disclosureLevel`, `preferredStructures`, `avoidPhrases`, `examplePhrases`).
- Calendar generation at `/clients/[id]/calendar` — month picker → triggers Inngest `calendar/generate` job → 8-second polling (hard timeout, not real-time). Plan-gated to growth/agency.
- Repurposing at `/clients/[id]/repurpose` — long-form → carousel/single/reel/story via `repurposeDraft` agent (Claude Haiku).
- `NICHE_EXAMPLES` in `packages/ai/src/templates/niche-examples.ts` is **bracket-placeholder scaffolding** (`"What your [symptom] is actually telling you"`) — domain-expert deliverable TODO.

### 5. Compliance

- 11 seed rules in DB (`packages/compliance/src/seed.ts`): 5 APA + 6 state-specific (CA × 2, NY × 1, TX × 1, FL × 1, IL × 1).
- Critic implemented as Claude Haiku tool-use call with `flag_violation` + `approve_content` tools (`packages/compliance/src/critic.ts`).
- Crisis detection (`packages/compliance/src/crisis.ts`): centroid of 12 seed phrases; cosine similarity threshold 0.75; resources fetched from `crisis_resources` DB table.
- Disclaimer injection by content type × state (`packages/compliance/src/disclaimer.ts`).
- Audit log: `generation_audit` table written by hooks route (NOT captions route).

### 6. Draft workflow

- State machine: `draft → ready_for_client → client_reviewing → approved | changes_requested → scheduled → published`. Stored in `drafts.status` enum + `draft_status_history` table.
- `send-for-review` route emails the last magic-link email (fragile: client must have visited portal previously).
- `complianceApproved: true` is **hardcoded** on `POST /api/v1/clients/[id]/drafts` for manually-saved drafts — bypasses real critic.

### 7. Client portal (magic-link)

- Public route group `/portal/[clientSlug]` — no Clerk, separate cookie-based auth.
- Magic-link flow: `POST /api/portal/auth/magic-link` (rate-limited 5/hr/email) → token hashed + stored → emailed via Resend → `GET /api/portal/auth/verify?token=...` consumes token, sets `portal_session` cookie (AES-GCM encrypted, httpOnly, SameSite=Lax, 24h, scoped to `/portal`).
- Approve / request-changes / threaded comments — all wired (`/api/portal/drafts/[id]/{approve,request-changes,comments}`).
- White-labeling via `clients.logoUrl`, `clients.primaryColor`, `clients.practiceName`.

### 8. Instagram integration

- OAuth: `/clients/[id]/instagram/{connect,callback,status}` (per-client tokens).
- Token storage: `instagram_tokens` table, encrypted with `INSTAGRAM_TOKEN_KEY` via `apps/web/lib/ig-crypto.ts`.
- Publishing: `instagram/publish` Inngest event → `ig-publish` function → Meta Graph API container + publish.
- Daily token refresh: `ig-token-refresh` cron (00:00 UTC) refreshes tokens expiring within 10 days.
- Daily metrics sync: `ig-metrics-sync` cron (06:00 UTC) — bare `catch {}` on per-draft errors swallows failures.
- **IG OAuth callback has same CSRF pattern as Drive callback had before fix** — unsigned base64url state, no `requireWorkspace()` re-check. Documented in `docs/superpowers/plans/2026-05-27-phase-2-review-followups.md` as CRITICAL.

### 9. Google Drive integration (Phase 2)

- OAuth: `/api/v1/workspace/google-drive/{connect,callback,status}` — workspace-scoped (not per-client).
- Token storage: `workspace_integrations` table, encrypted with `GOOGLE_DRIVE_TOKEN_KEY`. Post-iterative-review (2026-05-27): HMAC-signed OAuth state, workspaceId match check, opaque error codes, paginated files.list, per-file try/catch, in-process refresh dedup.

### 10. Billing (Stripe)

- 3 tiers: starter (free, 1 client), growth ($99/mo, 5 clients), agency ($299/mo, unlimited).
- Feature gating: `@smm/features` package, `canUseFeature()` + `clientLimit()` helpers. Only enforced on calendar route — `POST /api/v1/clients` has no client-count gate.
- Checkout: `/api/v1/billing/checkout` (Stripe Checkout session).
- Customer Portal: `/api/v1/billing/portal`.
- Webhook: `/api/webhooks/stripe` handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Signature verified. **Stripe API version mismatch**: code declares `2025-04-30.basil`, SDK expects `2026-04-22.dahlia`; `sub.current_period_end` no longer at top level → runtime breakage on webhook.
- Billing settings at `/settings/billing` — fully wired UI; **NOT linked from sidebar** (only reachable by URL).

### 11. Notifications

- Email: `@smm/notifications` exports `sendMagicLinkEmail`, `sendReviewRequestEmail`, `sendApprovalConfirmedEmail`, `sendChangesRequestedEmail`. All hardcode `from: "noreply@yourdomain.com"`.
- SMS: Twilio stub; silently no-ops if env vars missing.
- `monthly-reports.tsx` re-instantiates Resend instead of using `@smm/notifications` (duplication) AND uses same hardcoded placeholder `from`.

### 12. Trends + Reports

- `trend-sync` Inngest cron (Mon 08:00 UTC): Reddit + Psychology Today/APA RSS → score by upvote ratio → top-50 to `synthesizeTrends()` (Claude) → fan out trend rows to all workspaces. No declared retries → defaults to 4 → 4× LLM cost on failure.
- `/trends` page renders workspace trend topics grouped by week (up to 12 weeks). No empty-state guidance.
- `monthly-reports` cron (1st of month, 08:00 UTC): iterates all active clients, generates React-PDF, emails via Resend. Synchronous loop, no rate-limiting → Resend per-second cap risk at 50+ clients.
- Report endpoint: `/api/v1/clients/[id]/reports/[month]` (GET) — exists but has pre-existing TS issues (Buffer/BodyInit).

### 13. Data retention

- `data-retention` Inngest cron (daily 03:00 UTC): hard-deletes chunks for documents soft-deleted >30 days; then those documents; then `llmUsageLog` rows older than 13 months.

### 14. Workspace export

- `/api/v1/workspace/export` returns JSON dump of all workspace data. **Does NOT filter soft-deleted rows.**

## Data model (21 tables)

workspaces, users, workspace_members, clients, compliance_rules, generation_audit, brand_voices, drafts, draft_status_history, disclaimer_templates, llm_usage_log, knowledge_bases, documents, chunks, calendar_jobs, magic_link_tokens, draft_comments, instagram_tokens, trend_topics, stripe_subscriptions, rate_limit_hits, workspace_integrations.

## Tests inventory

- Unit: 50+ tests across ai, compliance, db, eval, features, ingestion, inngest, rag, scraper-cli, setup, storage, stripe, types, api (light coverage on most; deep on chunkers, RAG fusion, compliance critic)
- Integration: `tests/integration/rag/isolation.test.ts` (cross-client RAG), `tests/integration/compliance/violations.test.ts` (real-API critic)
- E2E: Playwright specs (portal + axe-core); pre-existing `tests/e2e/portal.spec.ts` import error from `@axe-core/playwright`

## Conventions & rules (path-scoped)

- `.claude/rules/workspace-scoping.md` — application-level workspace filter on every per-tenant query
- `.claude/rules/token-encryption.md` — per-provider env keys (INSTAGRAM_TOKEN_KEY, GOOGLE_DRIVE_TOKEN_KEY)
- `.claude/rules/rag-failsafe.md` — `retrieve()` wrapped in `.catch(() => ({ chunks: [], contextText: "" }))`
- `.claude/rules/vitest-aliases.md` — manual maintenance of vitest.config.ts aliases per workspace package
