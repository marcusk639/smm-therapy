# SMM Therapy Platform — Implementation Plan

**Date:** 2026-05-20  
**Stack:** Next.js 15 · Clerk · Neon Postgres + pgvector · Drizzle ORM · Inngest · Vercel · Cloudflare R2 · Anthropic (Claude + Agent SDK) · Voyage AI · Resend · Twilio · Stripe · React-PDF · Unstructured API (Railway)

---

## Confirmed Stack Changes from Original Brief

The following deviate from locked decisions in the original brief, confirmed during planning:

- **Inngest replaces Temporal** — Temporal requires persistent worker processes incompatible with Vercel's serverless runtime. Inngest runs inside Next.js Route Handlers, stores durable workflow state externally, and replays individual failed steps on retry — equivalent durability guarantees for every workflow in this product (ingestion pipelines, scheduled publishing, report generation, batch generation). Temporal Cloud ($200–400/mo from day one) is unnecessary at this stage. This is a confirmed decision, not a suggestion.
- **Neon for Postgres** — Managed Postgres with pgvector and HNSW indexes, PgBouncer connection pooling, and point-in-time recovery. Compatible with the locked pgvector + HNSW architecture. **Critical caveat:** Neon's PgBouncer runs in transaction mode by default, which does not preserve Postgres session variables across pooled connections. The `SET LOCAL app.workspace_id = ...` RLS pattern in the original design will not work reliably through the pooler. The chosen pattern must be resolved in Phase 0 (see Section 5 spike). Two options: (a) use unpooled Neon connection for all DB queries — safe but limits concurrency under load; (b) pass `workspace_id` explicitly in every Drizzle query condition rather than relying on a session variable — more code but pool-safe and airtight. Recommendation: option (b). This must be decided and documented before Phase 1.
- **Drizzle ORM** — Not specified in the brief. Type-safe SQL with first-class pgvector support, Neon serverless driver compatibility, and lightweight migrations. Prisma is the alternative; it has stronger codegen but heavier runtime, weaker pgvector primitives, and requires a separate migration shadow DB. Drizzle is the better fit for this stack.

---

## 1. Executive Summary

A multi-tenant SaaS automating Instagram content creation and client-handoff for SMMs serving licensed mental health practitioners. Differentiates on niche compliance depth, best-in-class RAG grounded in per-client knowledge, a full draft→approve→publish workflow, and ≤3-click speed to every common action. Target: solo/small-team SMMs managing 3–15 mental health clients, priced $150–400/mo.

Build strategy is **Option C (interleaved)**: Phase 0 ships a lean skeleton in ~1 week so Phase 1 generation can start immediately. Phase 0 infrastructure (RLS hardening, OpenAPI spec, compliance scaffolding) is completed concurrently during Phase 1. Meta app review is submitted in Week 2 to exploit the 4–6 week review window; it resolves roughly when Phase 5 (Meta integration) starts. Target: wife has a working hook/caption generator in ~5 weeks.

Total estimated solo timeline: **28–36 weeks** to launch-ready. The 18–24 week figure in earlier drafts was optimistic. Phase 2 RAG (6–8 weeks for a novel system with eval discipline), Phase 4 client handoff (4–5 weeks with Twilio A2P wall-clock time), and the 50-state compliance rules as a wife deliverable are the primary schedule drivers. Planning against 28–36 weeks avoids the morale cost of feeling perpetually behind.

---

## 2. Decisions Requiring Input Before Phase 0 Starts

1. **Meta app review strategy** — The spec says to submit in Phase 0. App review requires a working product demo. Options: (a) submit with a Loom walkthrough of the skeleton UI + written description of use case, or (b) wait until Phase 1 generation is working (~week 5) for a stronger demo. Recommended: **submit early with a written use case** — Meta reviews the use case, not just the UI. Rejection just means resubmission; lead time starts now.

2. **Clerk plan tier** — Free covers dev. Multi-org features needed for workspace isolation are available on Free (as of 2025), but verify current pricing for your expected workspace count. If >3 orgs in test, upgrade to Growth ($25/mo) before Phase 0 is done.

3. **Neon plan** — Free tier suspends compute after 5 min of inactivity (cold starts). Fine for solo dev; upgrade to Launch ($19/mo) before any real user testing to eliminate suspension.

4. **ORM: Drizzle confirmed** — Not specified in the original brief; Drizzle is recommended here (type-safe SQL, first-class pgvector + Neon serverless driver support, lightweight). If you have a strong Prisma preference, flag now — this affects Phase 0 schema files.

5. **S3-compatible storage: Cloudflare R2 confirmed** — Zero egress fees, S3 API compatible. Required: Cloudflare account. Alternative is Vercel Blob (simpler, $0.023/GB, fine if storage stays light). Flag if you prefer Vercel Blob.

6. **Product / brand name (blocking — move up from open questions)** — The brand name affects domain purchase, Vercel project naming, Resend domain verification (DKIM must be set up before any email flows work), Clerk branding, and portal URLs. Decide before Day 1. Once the domain is purchased, Resend DKIM verification can take 24–48h; don't let this block the Week 2 Meta submission.

7. **Domain name / portal URL strategy** — Once the brand name is decided, purchase the domain. Path-based portal (`yourdomain.com/portal/{token}`) is recommended for Phase 4 (avoids Vercel Pro wildcard DNS requirement). Wildcard subdomains (`*.yourdomain.com`) can be added post-launch for white-labeling.

8. **Wife's availability for Phase 0/1 content deliverables** — The niche hook pattern library and initial compliance rule set are blocking for Phase 1 acceptance criteria. Align on a realistic delivery date before Phase 0 ends.

9. **Stripe pricing tiers** — Exact tier names, feature gates, and price points need to be decided before Phase 7, but the billing schema is built in Phase 0. Decide tier structure (e.g., Starter/Growth/Agency) before Phase 0 DB migrations so the `plan` enum is correct from the start.

---

## 3. Cross-Cutting Concerns

### 3.1 Multi-Tenancy

**Model:** Clerk Orgs = SMM workspaces. Every authenticated request carries a Clerk `orgId`; middleware extracts it and sets it on all DB queries.

**DB isolation:** `workspace_id` is a non-nullable FK on every tenant-scoped table. Postgres RLS policies enforce isolation — no query can return rows from another workspace regardless of application code. Row-level security is enabled on all tenant tables in Phase 0.

**RLS pattern with Neon (resolved):** Neon's PgBouncer runs in transaction mode, which does not preserve `SET LOCAL` session variables across pooled connections. Do NOT use the `SET LOCAL app.workspace_id = ...` session variable pattern. Instead, pass `workspace_id` explicitly in every Drizzle query condition (e.g., `where(eq(table.workspaceId, workspaceId))`). RLS policies remain as a defense-in-depth layer at the DB, but the application layer enforces isolation through explicit query conditions. This pattern is pool-safe and auditable. Verified in Phase 0 spike before Phase 1 starts.

**Client isolation:** `client_id` is similarly enforced. A therapist's intake materials must never appear in another client's retrieval results. This is the second layer of RLS (workspace_id → client_id).

**Assumption surface:** Every new table added in any phase must carry the correct isolation columns. Add a CI lint rule (custom ESLint rule or Drizzle migration checker) to enforce this.

### 3.2 Compliance System

First-class system, not bolted on. Architecture:

- **Rules engine:** `compliance_rules` DB table with columns: `id`, `rule_text`, `rule_type` (prohibition | requirement | warning), `credential_types` (jsonb array: LCSW | LMFT | LPC | PsyD | PhD | MD), `states` (jsonb array, empty = all states), `source_citation`, `effective_date`, `version`. Rules are data, updated by the domain expert without code changes.
- **Compliance critic:** Claude Agent SDK workflow. Tools: `flag_violation(rule_id, offending_excerpt, explanation, severity)` and `approve_content(reasoning)`. Critic receives: generated content + the applicable rule set (filtered by the client's state + primary credential type). Runs before content surfaces to the SMM UI.
- **Disclaimer injection:** `disclaimer_templates` table keyed by content type + state. Auto-appended after generation passes the critic.
- **Crisis detection:** Pre-critic step. Embedding similarity against a crisis-topic vector (seeded with: suicide, self-harm, eating disorder, abuse). Score above threshold → force-include crisis resources from `crisis_resources` table + surface warning in UI. This runs even if compliance critic passes.
- **Audit log:** `generation_audit` table: generation_id, content (hash + ref), rules_version, violations_flagged, approved_by, published_at. Immutable. SMM can export this if questioned by a licensing board.

### 3.3 Authentication

**SMM users:** Clerk. JWT verified in Next.js middleware. Workspace context from Clerk org claim. API routes use `auth()` from `@clerk/nextjs/server`.

**Client approval portal:** Email magic-link only. No Clerk account for therapists. Flow: SMM triggers review → Resend sends magic link → link encodes a signed token (HMAC-SHA256, **15 min expiry**) → Next.js Route Handler validates token → on first valid click, issues a separate `httpOnly` session cookie (`portal_session`, 24h expiry) scoped to the `(portal)` route group → client browses their posts using the session cookie. The short token expiry prevents stale links from sitting in an inbox for days; the session cookie allows normal navigation after the initial click. `PORTAL_SECRET` must be in `.env.example`.

**API auth:** Bearer token for programmatic access (future use). Issued per workspace, stored hashed in `workspace_api_keys`.

### 3.4 Observability

- **Error tracking:** Sentry (Next.js SDK + server-side). Source maps uploaded on Vercel build. Sentry coverage explicitly includes the `(portal)` route group — the portal handles client data and magic-link auth, so errors there are critical to catch.
- **Audit log:** Compliance-required, in Postgres (see 3.2). Not Sentry.
- **Workflow observability:** Inngest dashboard (built-in) for function runs, retries, failures.
- **LLM observability:** Log every Anthropic API call: model, prompt token count, completion tokens, cache hit/miss, latency, cost estimate. Store in `llm_usage_log` table. Aggregate per workspace/month for billing enforcement.
- **Frontend:** Vercel Analytics (built-in, zero config).
- **Alerting:** Sentry alerts on error rate spikes. Inngest alerts on function failure rate. No custom alerting needed for v1.

### 3.5 Testing Strategy

| Layer       | Tool                             | Scope                                                                                          |
| ----------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| Unit        | Vitest                           | Pure functions: Zod schemas, compliance matchers, retrieval utilities, prompt builders         |
| Integration | Vitest + Neon branch             | API routes, DB queries, Inngest function logic against a real Neon test branch                 |
| E2E         | Playwright                       | Critical user flows: auth, client create, generate hooks, compliance flagging, approval portal |
| RAG eval    | Custom harness (`packages/eval`) | Retrieval recall@k, MRR, LLM-as-judge on hand-curated query/chunk pairs                        |
| Compliance  | Vitest                           | Seeded violation test cases (20+ cases from wife), each with expected flag/approve result      |

Neon branching is the key integration testing primitive: each CI run creates a branch, runs migrations, runs tests, destroys branch. No shared test DB state.

Target coverage: 80% on `packages/compliance`, `packages/rag`, `packages/ai`. Lower bar on UI components (Playwright covers the critical paths).

### 3.6 RAG Evaluation Discipline

- `packages/eval` contains: eval set (JSON), harness runner, scoring logic (recall@k, MRR, LLM-as-judge via Claude Haiku).
- Eval set is a wife/domain-expert deliverable — see Section 4.
- Harness runs in CI on every change to `packages/rag`.
- Metrics stored in a simple `eval_results` JSON file checked into git — regressions are visible in PRs.
- Promptfoo may scaffold the LLM-as-judge scoring; the query/chunk eval set is hand-curated, never auto-generated.

### 3.7 Data Retention Policy

Decide in Phase 0; retrofitting is hard. Recommended defaults:

| Data type              | Retention               | Rationale                                                       |
| ---------------------- | ----------------------- | --------------------------------------------------------------- |
| `generation_audit` log | Indefinite              | SMM may need to defend content to a licensing board years later |
| Embeddings / chunks    | Delete on client delete | No ongoing value; GDPR-adjacent hygiene                         |
| Draft posts            | Delete on client delete | Or export first (see 3.8)                                       |
| `llm_usage_log`        | 13 months               | Billing disputes                                                |
| Portal session tokens  | Delete on expiry        | No retention needed                                             |
| Post metrics           | Retain with post        | Part of the monthly report history                              |

Schema: add `deleted_at` (soft delete) to all client-scoped tables. A background Inngest cron handles hard delete of embeddings/chunks after a grace period (30 days post soft-delete).

### 3.8 Content Export

SMMs who churn will demand their content and knowledge bases. Build export into the data model from Phase 0:

- Every entity has a `workspace_id` FK → export is `SELECT * WHERE workspace_id = ?`
- Phase 7 surfaces a "Export all data" action in workspace settings
- Export format: zip of JSON (drafts, brand voices, audit logs) + a folder of uploaded documents (R2 presigned download links)
- Legally, "your data is yours" reduces churn friction and is the right default

### 3.9 Rate Limiting

Add to Phase 0 cross-cutting infrastructure:

- **Magic-link redemption** (`GET /api/portal/auth`): 5 attempts per email per hour via Upstash Redis or Vercel KV. Prevents brute-force token guessing.
- **Generation endpoints** (`POST /api/v1/.../generate/*`): 20 requests/minute per workspace, enforced at the API route level. Prevents runaway client code from exhausting AI credits.
- **Public API** (bearer token, future use): per-key rate limit stored in Redis.
- Implementation: a thin `rateLimit(key, limit, window)` helper wrapping Upstash Redis (free tier: 10K requests/day — sufficient for early stage; upgrade when needed).

### 3.10 Accessibility

The client approval portal is the one surface therapists use directly. Mental health practitioners are often more sensitive to accessibility than typical SaaS users and may serve disabled clients themselves.

- **WCAG 2.1 AA** conformance required on the `(portal)` route group from Phase 4 day one
- Minimum: keyboard navigation for approve/reject actions, sufficient color contrast on status indicators, screen-reader labels on all interactive elements
- Recommended: run `axe-core` in Playwright E2E tests on the portal acceptance criteria suite
- The `(app)` SMM UI targets WCAG 2.1 AA as a best-effort goal for Phase 7 (launch prep), not a Phase 4 blocker

---

## 4. Domain Expert (Wife) Deliverables by Phase

These are blocking or near-blocking for the corresponding engineering work. Plan delivery dates accordingly.

### Phase 0/1 (Weeks 1–5)

- [ ] **Niche hook pattern library** — 30–50 proven hook structures for mental health content (e.g., "What your [symptom] is actually telling you", "3 things I wish I'd known before starting therapy"). Used for hook ranking and few-shot prompting. Needed before Phase 1 acceptance criteria can pass.
- [ ] **Initial compliance rule set** — APA ethics code relevant advertising rules + state-specific rules for CA, NY, TX, FL, IL. Format: plain language with source citations. Engineering converts to DB records. Needed before compliance critic can be tested.
- [ ] **Brand voice sample content** — 20–30 example posts per major voice archetype (warm/relatable, clinical/authoritative, educational, personal). Needed for brand voice profile builder prompt tuning.
- [ ] **Crisis resource templates** — Standard crisis resource text for: suicidality (988 + Crisis Text Line), eating disorders (NEDA), domestic abuse (National DV Hotline), self-harm. Per the content types the compliance system must handle.

### Phase 1 (Weeks 3–5)

- [ ] **Niche content pillar definitions** — Precise definitions of each pillar: psychoeducation, normalization, coping skills, behind-the-scenes, community, awareness days. With 5–10 example posts per pillar. Used for content calendar generation + caption format selection.
- [ ] **Mental health awareness calendar** — Awareness days/months relevant to mental health practices (Suicide Prevention Month Sep, Mental Health Awareness Month May, etc.) with content angles for each. JSON or spreadsheet.

### Phase 2 (Weeks 6–10)

- [ ] **RAG eval set (Phase 2 blocker)** — 50–100 query/expected-chunk pairs for the niche knowledge base. Example: query "psychoeducation post about anxiety" → expected chunks: [niche_pattern_X, awareness_calendar_Y]. This takes meaningful time to curate; start early.
- [ ] **Shared niche knowledge base content** — Summaries of APA, ACA, NASW ethics codes (advertising sections); state-by-state advertising rules for 5 launch states; content pattern library. Ingested as the shared knowledge base in Phase 2.

### Phase 3 (Weeks 11–13)

- [ ] **Full 50-state compliance rules** — Phased: 5 states in Phase 1, full 50 in Phase 3. This is a significant research effort; break into batches (5 states per week is realistic).
- [ ] **Content calendar templates** — Example 4-week calendars for different practice types (solo LCSW, group practice, psychologist). Used as generation examples.

### Phase 6 (Weeks 17–20)

- [ ] **Monthly report template** — What metrics matter to a mental health SMM's client? What narrative framing resonates? Design the report structure before engineering builds the renderer.

---

## 5. Phase 0 — Foundations Skeleton

**Strategy:** Lean skeleton in ~1 week. Full hardening runs concurrently with Phase 1.

### Deliverables

- pnpm workspaces + Turborepo monorepo
- Next.js 15 App Router, Tailwind CSS, shadcn/ui
- Clerk auth + workspace multi-tenancy (Orgs)
- Neon Postgres + pgvector + Drizzle ORM + migrations
- Core schema: `workspaces`, `users`, `workspace_members`, `clients`
- Row-level security policies (workspace isolation)
- **Phase 0 spike: Neon RLS + pooling pattern** — verify explicit `workspace_id` condition approach works through PgBouncer transaction-mode pooling; document the chosen pattern in `packages/db/RLS.md` before Phase 1 starts
- Inngest client + dev server + single smoke-test function
- Cloudflare R2 for object storage (presigned upload/download URLs)
- OpenAPI 3.1 scaffolding (`@asteasolutions/zod-to-openapi`)
- Basic CRUD: workspace create/read, client CRUD
- `compliance_rules` table schema (empty data, schema only)
- Vercel project + env var structure documented
- Meta Business Platform app submitted
- Unstructured API service deployed to Railway (Docker)
- Sentry installed (Next.js SDK + server)

### File/Module Structure

```
/
├── apps/
│   └── web/
│       ├── app/
│       │   ├── (app)/                    # Authenticated app shell
│       │   │   ├── layout.tsx            # Sidebar + workspace switcher
│       │   │   ├── dashboard/page.tsx
│       │   │   └── clients/
│       │   │       ├── page.tsx          # Client list
│       │   │       └── new/page.tsx
│       │   ├── api/
│       │   │   ├── v1/
│       │   │   │   ├── workspaces/route.ts
│       │   │   │   └── clients/route.ts
│       │   │   └── inngest/route.ts      # Inngest HTTP endpoint
│       │   ├── (marketing)/              # Public pages (empty shell)
│       │   └── (portal)/                 # Client approval portal (empty shell)
│       └── middleware.ts                 # Clerk auth enforcement
│
├── packages/
│   ├── db/
│   │   └── src/
│   │       ├── schema/
│   │       │   ├── workspaces.ts
│   │       │   ├── clients.ts
│   │       │   ├── users.ts
│   │       │   └── compliance-rules.ts   # Schema only, no data
│   │       ├── client.ts                 # Neon serverless + Drizzle instance
│   │       ├── rls.ts                    # RLS policy SQL helpers
│   │       └── migrations/
│   ├── types/
│   │   └── src/
│   │       ├── workspace.ts              # Zod schemas
│   │       └── client.ts
│   ├── inngest/
│   │   └── src/
│   │       ├── client.ts                 # createInngestClient
│   │       └── functions/               # Empty, populated later
│   └── compliance/
│       └── src/
│           ├── schema.ts                 # Rule shape types
│           └── engine.ts                # Skeleton: getRulesForClient(), runCritic()
│
└── services/
    └── docker-compose.yml               # Unstructured local dev
```

### Dependencies

None — this is the foundation.

### Acceptance Criteria

- `pnpm dev` starts Next.js on `localhost:3000` with hot reload
- `pnpm inngest:dev` starts Inngest dev server on `localhost:8288`
- Clerk sign-up/sign-in works; workspace created on first Clerk Org creation
- Client CRUD (create, list, update, soft-delete) works with workspace isolation enforced
- Attempting to access another workspace's client returns 403
- **RLS spike verified:** explicit `workspace_id` query condition enforces isolation through Neon's PgBouncer pooler; pattern documented in `packages/db/RLS.md`
- `docker compose up` in `services/` starts Unstructured on `localhost:8000`
- `pnpm migrate` runs Drizzle migrations cleanly on Neon
- OpenAPI spec generates from Zod schemas without errors
- Vercel preview deployment succeeds

### Estimated Complexity

Medium — boilerplate-heavy, minimal algorithmic complexity. Risk is in wiring Clerk Orgs → DB workspace_id correctly the first time.

### Definition of Done

- All acceptance criteria pass
- RLS policies verified; explicit `workspace_id` condition pattern documented in `packages/db/RLS.md`
- Vercel project created, environment variables documented in `.env.example` (including `PORTAL_SECRET`)
- Railway Unstructured service deployed and health-checked
- Meta app review submitted (Loom + written use case)
- Sentry capturing errors in preview deployment

### Testing Strategy

- **Unit:** Zod schema parse/serialize tests for all types
- **Integration:** Drizzle migration + RLS policy tests against Neon CI branch; workspace isolation test (cross-workspace client read must return empty)
- **E2E:** Auth flow (sign up → workspace created → client create → client list shows new client)

### Risks and Unknowns

- Clerk Org model: verify that `orgId` is stable as the workspace identifier (it is, but confirm `orgSlug` behavior for the client portal URL strategy in Phase 4)
- RLS + Neon pooling: **resolved** — use explicit `workspace_id` query conditions, not session variables. Documented in `packages/db/RLS.md` as part of Phase 0 spike. Cross-workspace isolation integration test enforces this in CI.
- Meta app review: rejection is likely on first submission; plan for one resubmission cycle. The 4–6 week estimate assumes approval on second submission.
- Neon PITR backup retention: verify backup retention window for your chosen Neon plan tier before going to production. Free tier retains 24h; Launch tier retains 7 days. Confirm this meets your needs before Phase 5.

---

## 6. Phase 1 — Generation Core

**Strategy:** Start in Week 2 (Day 8–9) after auth + DB are wired. Run parallel with Phase 0 hardening. Wife should have a working generator by Week 5.

### Deliverables

- Hook generator: 10–20 hooks per topic, ranked against niche patterns, filtered for compliance
- Caption generator: 5 format variants, brand-voice-aware, compliance-checked, disclaimer-injected
- Brand voice profile builder: structured profile from sample content uploads
- Compliance critic: APA + CA, NY, TX, FL, IL rule set, all violation types
- Crisis detection pre-check
- Niche few-shot example library (populated with wife's content)
- Generation audit log
- Generation UI: topic input → hooks → select → caption variants → edit inline → save draft

### File/Module Structure (additions to Phase 0)

```
packages/ai/
└── src/
    ├── client.ts                         # Anthropic SDK wrapper, cache_control applied
    ├── prompts/
    │   ├── hooks.ts                      # System + user prompt builders for hook gen
    │   ├── captions.ts                   # Caption format variants
    │   ├── brand-voice.ts                # Voice profile extraction prompt
    │   └── compliance-critic.ts          # Critic system prompt
    ├── templates/
    │   └── niche-examples.ts             # Few-shot examples (wife deliverable)
    └── cache.ts                          # Prompt caching helpers

packages/compliance/
└── src/
    ├── rules/
    │   ├── apa.ts                        # APA rules as typed DB seed data
    │   └── states/
    │       └── ca.ts ny.ts tx.ts fl.ts il.ts
    ├── critic.ts                         # Claude Agent SDK workflow
    ├── crisis.ts                         # Crisis topic detection
    └── disclaimer.ts                     # Disclaimer injection

packages/db/
└── src/schema/
    ├── generations.ts                    # Audit log: id, content_hash, rules_version, violations
    ├── brand-voices.ts                   # Per-client voice profiles
    └── drafts.ts                         # Draft posts (no publishing yet)

apps/web/app/(app)/clients/[clientId]/
├── generate/
│   ├── hooks/page.tsx                    # Hook generation UI
│   └── captions/page.tsx                 # Caption generation UI
└── brand-voice/page.tsx                  # Voice profile builder
```

### Key Implementation Notes

**Prompt caching:** The system prompt block (niche knowledge + few-shot examples + ethics codes) is large and static per request type. Apply `cache_control: {type: "ephemeral"}` to this block. Expect >80% cache hit rate after the first request per cold start. Log cache hits via `usage.cache_read_input_tokens` in every response.

**Compliance critic (Claude Agent SDK):** Define two tools — `flag_violation` and `approve_content`. The workflow: (1) retrieve applicable rules for `client.state` + `client.credential_type`, (2) run critic with content + rules, (3) collect all `flag_violation` calls, (4) if any violations, surface to SMM UI with rule citations; do not surface to client portal. SMM can override with an explicit acknowledgment logged to audit.

**Hook ranking:** Embed all hooks and the niche pattern library using `voyage-3` at generation time. Cosine similarity against pattern embeddings. No DB lookup yet (Phase 2 adds RAG); just rank in-memory against the 30–50 patterns from the niche library.

**Brand voice profile:** Structured JSON output: `{ tone: 1-10, vocabularyLevel: "plain"|"mixed"|"clinical", disclosureLevel: "minimal"|"moderate"|"personal", preferredStructures: string[], avoidPhrases: string[], examplePhrases: string[] }`. Extracted by Claude from uploaded sample posts. Persisted in `brand_voices` table. Injected as a context block in every subsequent generation for that client.

**Crisis detection:** Before the compliance critic runs, check content for crisis topics using embedding similarity (threshold: 0.75 cosine against a pre-embedded crisis-topic centroid). If triggered: force-append crisis resources from `crisis_resources` table + set `requires_crisis_resources: true` on the draft + surface a yellow warning banner in the SMM UI.

### Dependencies

- Phase 0 skeleton (auth, Neon, Inngest wired)
- Wife deliverable: niche hook pattern library (blocking for hook ranking)
- Wife deliverable: initial compliance rule set for 5 states (blocking for critic acceptance tests)

### Acceptance Criteria

- Generate 10+ hooks for any mental health topic in <15s (including compliance critic)
- All 5 caption formats generate successfully for any topic
- Compliance critic flags "I can cure your anxiety" as a `treatment_guarantee` violation citing the correct rule
- Compliance critic does NOT flag "Therapy can help you manage anxiety" (false positive check)
- Brand voice profile persists per client; captions for a "warm/relatable" profile differ measurably from "clinical/authoritative"
- Crisis detection triggers on "suicidal thoughts" topic; crisis resources appear in output
- Disclaimer auto-appended on educational content types
- Every generation has an audit log entry with `rules_version` populated
- Wife can complete a full generate → review → save draft flow without friction

### Estimated Complexity

High — prompt engineering quality, compliance logic correctness, and inline editing UX are all non-trivial. The compliance critic false positive rate needs careful tuning.

### Definition of Done

- All acceptance criteria pass
- 20+ seeded violation test cases pass in CI
- Prompt cache hit rate >80% verified (Anthropic usage dashboard)
- Wife has used the generator for at least 3 real clients/scenarios and signed off on output quality
- Audit log populated with `rules_version` for every generation

### Testing Strategy

- **Unit:** Compliance rule matchers (does rule X apply to state Y + credential Z?); disclaimer injection logic; crisis detection threshold
- **Integration:** Compliance critic against all 20+ seeded violation cases + 10 non-violation cases; brand voice injection changes output measurably (LLM-as-judge via Claude Haiku)
- **E2E:** Full generation flow (log in → select client → enter topic → see hooks → flag compliance violation → save draft)

### Risks and Unknowns

- Anthropic rate limits: Claude Agent SDK compliance critic + generation in sequence may hit RPM limits under load. Add request queuing via Inngest (fan-out generation to a separate function, debounce rapid user requests).
- Compliance false positive rate: the critic may over-flag in early versions. Budget wife's time for 2–3 prompt tuning sessions. Track false positive rate explicitly.
- Meta app review still pending — expected, does not block Phase 1.

---

## 7. Phase 2 — Knowledge Layer (RAG)

**Estimated duration:** 6–8 weeks (Weeks 6–13, revised upward from earlier estimates)

### Deliverables

- `workspace → client → knowledge_base → document → chunk` schema with RLS
- Ingestion Inngest workflows for: file upload (PDF/audio/video/text), YouTube URL, podcast RSS, Google Drive folder, public web URL, manual IG post paste
- `unstructured-client` integration for complex PDF parsing (via Railway)
- Per-source-type chunking: recursive (clean text), semantic (transcripts), heading-aware (structured PDFs), one-chunk-per-post (IG posts)
- Voyage `voyage-3` embeddings via thin provider abstraction
- Hybrid retrieval: pgvector dense + Postgres `tsvector` BM25, fused via RRF, recency boost
- Voyage `voyage-rerank-2` reranking (top-50 → top-10)
- Typed `retrieve(query, options)` module with per-client/shared-niche routing
- Citation construction and UI integration (hover/click to see source chunks)
- Eval harness (`packages/eval`) with initial eval set
- RAG integrated into Phase 1 hook/caption generation workflows
- Ingestion status UI: document list, per-document status (fetch|parse|chunk|embed|store|failed), retry action

### File/Module Structure (additions)

```
packages/rag/
└── src/
    ├── retrieve.ts                       # retrieve(query, options) — the core module
    ├── hybrid.ts                         # RRF fusion of dense + keyword results
    ├── rerank.ts                         # voyage-rerank-2 client
    ├── embed.ts                          # Embedding abstraction (provider-swappable)
    ├── citations.ts                      # Citation construction from chunks
    └── query-rewrite.ts                  # Ambiguous query rewriting

packages/ingestion/
└── src/
    ├── sources/
    │   ├── file-upload.ts                # R2 upload → Unstructured → parse
    │   ├── youtube.ts                    # Official YouTube Transcript API only (no yt-dlp)
    │   ├── podcast-rss.ts                # RSS fetch + episode audio download
    │   ├── google-drive.ts               # Drive API folder sync
    │   ├── web-url.ts                    # HTML fetch + readability extract
    │   └── ig-posts.ts                   # Manual paste parser
    ├── chunkers/
    │   ├── recursive.ts                  # Clean text
    │   ├── semantic.ts                   # Transcript (embedding similarity on adjacent windows)
    │   ├── heading-aware.ts              # Structured PDFs
    │   └── single-chunk.ts              # IG posts (one post = one chunk)
    └── pipeline.ts                       # Inngest workflow: fetch→parse→chunk→embed→store

packages/eval/
└── src/
    ├── harness.ts                        # Run eval set, compute metrics
    ├── metrics.ts                        # recall@k, MRR, LLM-as-judge
    ├── eval-set/
    │   └── niche-mental-health.json      # Hand-curated query/chunk pairs (wife deliverable)
    └── results/
        └── latest.json                   # Checked into git; CI compares vs. threshold

packages/db/
└── src/schema/
    ├── knowledge-bases.ts
    ├── documents.ts                      # source_type, status, stage, rights_confirmed
    └── chunks.ts                         # embedding vector, tsvector, metadata jsonb, client_performance_score
```

### Key Implementation Notes

**Ingestion pipeline (Inngest):** Each source maps to an Inngest function with steps: `fetch` → `parse` → `chunk` → `embed` → `store`. Each step is wrapped in `step.run()` for idempotency. Failed documents surface in UI with the failed stage + a retry button that re-enqueues the Inngest event from that stage (not from scratch).

**Semantic chunking (transcripts):** Embed adjacent 512-token windows. Compute cosine similarity between consecutive windows. Where similarity drops below 0.65, emit a chunk boundary. This catches topic shifts in podcast transcripts far better than fixed character splits. Minimum chunk size: 200 tokens. Maximum: 800 tokens.

**Hybrid retrieval (RRF):** Run both vector search (`<->` operator on HNSW index) and `tsvector` full-text search in parallel. Merge via Reciprocal Rank Fusion: `score = 1/(k + rank)` for each result list (k=60), sum scores, sort descending. Apply recency boost as a multiplicative factor: `final_score = rrf_score * (1 + recency_weight * days_recency_factor)`. `recency_weight` is configurable per knowledge base type (0.3 for client's own posts, 0.05 for shared niche content).

**Embedding abstraction:**

```typescript
interface EmbeddingProvider {
  embed(texts: string[]): Promise<number[][]>;
  model: string;
  dimensions: number;
}
```

Single implementation (`VoyageEmbeddingProvider`) in Phase 2. Provider is injected into `retrieve()` and the ingestion pipeline. Swapping to a different vendor touches only the provider file.

**Shared niche knowledge base:** A `workspace_id = NULL, client_id = NULL` partition that all workspaces can read. The `retrieve()` function blends client-specific and shared results at query time with configurable weighting (default: 60% client-specific, 40% shared niche). RLS allows reads from the shared partition for any authenticated workspace.

**Rights confirmation:** Every ingestion endpoint requires `rights_confirmed: true` in the request body. Stored as `rights_confirmed_at` timestamp + `rights_confirmed_by` (user_id) on the `documents` table. UI shows a checkbox with explicit copy before upload proceeds.

### Ingestion Failure Modes

Each failure mode needs a defined UX — not just a generic error state:

| Failure                                                                       | Stage | UX                                                                                                   |
| ----------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------- |
| PDF with non-UTF8 encoding or corrupt file                                    | parse | "Could not read this file. Try re-exporting as PDF/A." + retry                                       |
| PDF > 50MB                                                                    | fetch | Block at upload; show file size limit before upload starts                                           |
| YouTube video with no transcript (auto-captions disabled)                     | fetch | "No transcript available. Upload the audio file instead." + direct link to upload                    |
| Podcast RSS feed returns 404 / malformed XML                                  | fetch | "Feed URL is unreachable or invalid." + retry + manual URL correction                                |
| Podcast episode audio in unsupported codec (non-MP3/MP4/WAV/M4A)              | parse | "Unsupported audio format. Convert to MP3 and re-upload."                                            |
| Google Drive folder with permission revoked mid-sync                          | fetch | "Access to this folder was removed. Re-connect Google Drive." + OAuth re-auth link                   |
| Unstructured API returns 5xx (Railway outage)                                 | parse | Auto-retry 3× with exponential backoff via Inngest; surface "Processing delayed" if all retries fail |
| Groq Whisper transcription fails (audio too short < 0.1s, or too long > 25MB) | parse | "Audio file could not be transcribed. Check file length and format."                                 |
| Embedding API rate limit hit                                                  | embed | Inngest step retries with backoff; no user-visible error unless stuck > 10 min                       |
| Chunk count exceeds per-client limit (future billing gate)                    | store | "Knowledge base storage limit reached for this client." + upgrade prompt                             |

All failure modes update `documents.status = 'failed'` and `documents.failed_stage` in the DB. The ingestion status UI shows the failed stage name and the appropriate message above.

### Dependencies

- Phase 0 (DB, Inngest, R2)
- Phase 1 generation workflows (to integrate retrieval into existing prompts)
- Wife deliverable: RAG eval set (50–100 query/chunk pairs) — **Phase 2 blocker**
- Wife deliverable: shared niche knowledge base content (ethics codes, state rules, pattern library)

### Acceptance Criteria

- File upload (PDF, MP3, MP4) → ingested → retrievable in <5 minutes
- YouTube URL ingested (transcript extracted) → retrievable
- Semantic chunking: a 60-minute podcast transcript produces topically coherent chunks (no mid-sentence splits, topic breaks at correct boundaries)
- `retrieve("psychoeducation post about anxiety", { clientId })` returns chunks from the client's knowledge base + relevant niche content, with citations
- Retrieval eval harness: recall@5 ≥ 0.75 on the initial eval set
- Hook and caption generators use retrieved context; outputs are measurably more on-brand than Phase 1 pure-prompting outputs (LLM-as-judge comparison)
- Cross-client retrieval is impossible: attempt to retrieve client-B chunks from client-A context returns empty
- Ingestion failure surfaces in UI with the correct failed stage

### Estimated Complexity

Very High — the most technically complex phase. Semantic chunking, hybrid retrieval, RRF fusion, eval harness, and 6 ingestion source types are each non-trivial. Budget 6–8 weeks; do not compress.

### Definition of Done

- All acceptance criteria pass
- Eval harness runs in CI; recall@5 ≥ 0.75 threshold enforced as a CI gate
- Cross-client isolation test passes
- Ingestion pipeline tested for all 6 source types
- Unstructured Railway service handles a 50-page PDF with tables without errors

### Testing Strategy

- **Unit:** RRF fusion math; recency boost calculation; semantic chunking boundary detection; embedding abstraction interface
- **Integration:** Full ingestion pipeline for each source type against a real Neon branch + Railway Unstructured; `retrieve()` returns expected chunks against known test documents
- **RAG eval:** Harness run against initial eval set; results checked into git; CI fails if recall@5 drops below threshold
- **E2E:** Upload a PDF → wait for ingestion → generate a caption → see citation from the uploaded document

### Risks and Unknowns

- **Semantic chunking quality:** The embedding similarity threshold (0.65) is a starting point. May need tuning per source type. Evaluate against the eval set before committing.
- **Neon `tsvector` scalability:** At large chunk volumes, Postgres FTS may become a bottleneck. Monitor query plan for sequential scans. Add a `gin` index on the `tsvector` column in Phase 2. Flag if query latency exceeds 500ms at 100K chunks.
- **Unstructured Railway service cold starts:** Railway services may have cold starts if on a free/shared plan. Use a paid Railway plan ($5/mo) or keep the service warm with a health-check ping from Inngest.
- **Google Drive OAuth:** Requires OAuth app verification for `drive.readonly` scope. May have a review lead time similar to Meta. Submit early.
- **YouTube no-transcript videos:** The official YouTube Transcript API returns no transcript for many videos (auto-captions may be unavailable or disabled). When no transcript is available, prompt the user to upload the audio file directly for Groq Whisper transcription. No yt-dlp in the product — yt-dlp violates YouTube's ToS for a deployed SaaS and is only in the private scraper CLI.

---

## 8. Phase 3 — Agent Workflows

**Estimated duration:** 2–3 weeks (Weeks 11–13)

### Deliverables

- Content calendar generator: 2–4 weeks of post ideas, balanced across pillars, awareness-calendar-aware
- Content repurposing: long-form input → week of IG content (carousel, single posts, Reel scripts, Stories)
- Voice consistency critic: post-generation check that content matches the client's brand voice profile
- Expanded compliance critic: full 50-state coverage (wife deliverable: 45 additional states)
- Claude Agent SDK integration for all multi-step workflows
- Content calendar UI: drag-and-drop week view, pillar filter, awareness day indicators

### File/Module Structure (additions)

```
packages/ai/
└── src/
    ├── agents/
    │   ├── calendar-agent.ts             # Claude Agent SDK calendar workflow
    │   ├── repurpose-agent.ts            # Repurposing workflow
    │   └── voice-critic.ts               # Voice consistency critic
    └── prompts/
        ├── calendar.ts
        └── repurpose.ts

apps/web/app/(app)/clients/[clientId]/
├── calendar/page.tsx                     # Calendar UI (drag-and-drop)
└── repurpose/page.tsx                    # Long-form → content week

packages/db/
└── src/schema/
    └── calendar-items.ts                 # Post ideas with pillar, date, awareness_day_ref
```

### Key Implementation Notes

**Content calendar (Claude Agent SDK):** Tools: `propose_post(date, pillar, topic, rationale)`, `check_awareness_calendar(date_range)`, `get_pillar_balance(proposed_posts)`, `finalize_calendar()`. The agent calls tools iteratively to balance pillars and respect awareness dates. Final output is a structured calendar written to `calendar_items`.

**Voice consistency critic:** Runs after the compliance critic, before surfacing to SMM. Embeds the generated content and the client's voice profile `examplePhrases`. If cosine similarity to the "avoid" phrases is high, or similarity to the voice profile is below threshold, flags "voice mismatch" with specific suggestions. Does not block generation — advisory only.

**Repurposing:** Takes one long-form input (text, transcript, or `document_id` from the knowledge base). Agent workflow: (1) extract key themes via retrieval + LLM, (2) map themes to content formats (carousel = multi-step concept, single post = one insight, Reel script = hook + 60s script, Story = question/poll idea), (3) generate each format in sequence, (4) run compliance critic on all outputs, (5) return structured batch.

### Dependencies

- Phase 1 (generation, compliance critic, brand voice)
- Phase 2 (RAG integrated into calendar + repurposing for context grounding)
- Wife deliverable: full 50-state compliance rules (near-blocking for Phase 3 critic upgrade)
- Wife deliverable: content calendar templates + pillar definitions (Phase 1 deliverable, needed here for calendar logic)

### Acceptance Criteria

- Calendar generator produces 4 weeks of posts with ≥3 different pillars represented
- Calendar respects awareness dates (Mental Health Awareness Month posts appear in May)
- Repurposing a 1000-word blog post produces all 4 content formats, all compliance-checked
- Voice consistency critic flags "hey guys" in a clinical-tone profile
- 50-state compliance critic covers all states (spot-check 10 states for correct rules)

### Estimated Complexity

High — agent tool loops require prompt engineering for reliable tool-call sequences.

### Definition of Done

- All acceptance criteria pass
- Wife approves calendar output quality for 3 different practice types
- Compliance critic covers 50 states; all seeded test cases pass
- Agent workflows complete without tool-call loops exceeding 10 iterations

### Testing Strategy

- **Unit:** Pillar balance checker; awareness calendar lookup; tool schema validation
- **Integration:** Calendar agent produces valid output against mocked knowledge base; repurposing agent runs all format generators
- **E2E:** Full calendar generation flow (select client → generate calendar → drag to reschedule → save)

### Risks and Unknowns

- Agent tool-call loops: the calendar agent may generate unbalanced calendars if the pillar-balance tool isn't checked every iteration. Enforce a maximum iteration count + a post-generation validation pass.
- 50-state compliance rule delivery: this is a large wife deliverable. If not ready, Phase 3 ships with the existing 5-state critic and adds states incrementally.

---

## 9. Phase 4 — Client Handoff

**Estimated duration:** 4–5 weeks (Weeks 14–18, includes Twilio A2P wall-clock time)

### Deliverables

- Client approval portal: per-client branded URL, mobile-first, magic-link auth
- Internal review workflow: draft → ready-for-client → client-reviewing → approved/changes-requested → scheduled
- Threaded comments: per-post comment threads between SMM and client
- Email notifications: Resend (review request, approval, changes requested)
- SMS notifications: Twilio (optional, per-client setting)
- Auto-generated monthly client reports: React-PDF white-labeled PDF + web view
- Per-client branding: logo, primary color, practice name on portal + reports
- Report data: posts published, engagement metrics (placeholder until Phase 5 Meta sync), follower growth, top performers, pillar breakdown

### File/Module Structure (additions)

```
apps/web/app/
└── (portal)/                             # Separate route group, minimal layout
    └── [clientSlug]/
        ├── layout.tsx                    # Branded layout (logo, color from client config)
        ├── page.tsx                      # Posts pending approval list
        └── posts/[postId]/page.tsx       # Single post review: approve / request changes

packages/notifications/
└── src/
    ├── email.ts                          # Resend client + templates
    └── sms.ts                            # Twilio client

packages/reports/
└── src/
    ├── monthly-report.tsx                # React-PDF component
    └── generator.ts                      # Inngest scheduled function (monthly cron)

packages/db/
└── src/schema/
    ├── post-status.ts                    # Workflow state machine
    ├── comments.ts                       # Threaded comments
    ├── portal-tokens.ts                  # Magic-link tokens (HMAC, 15 min TTL) + session cookie (24h)
    └── client-branding.ts               # Logo R2 key, primary color, practice name
```

### Key Implementation Notes

**Magic-link auth:** `POST /api/v1/portal/send-link` → generates HMAC-SHA256 token (15 min expiry) → Resend sends link → client clicks → `GET /api/portal/auth?token=...` validates token (reject if expired or already used — mark token as consumed in DB) → issues a separate `httpOnly` session cookie (`portal_session`, 24h expiry, SameSite=Lax) scoped to the `(portal)` route group → client browses posts using the session cookie. Token is single-use; clicking the link twice on a fresh token is fine (second click finds token consumed, shows "link already used" with a re-send option). No Clerk involvement.

**Post status state machine:** `draft → ready_for_client → client_reviewing → approved | changes_requested → revision → ready_for_client (loop) | scheduled`. Store as an enum column + a `post_status_history` table for audit trail.

**Per-client portal URL strategy:** `{workspaceSlug}-{clientSlug}.yourdomain.com` subdomain via Vercel wildcard domain, OR a path-based approach: `yourdomain.com/portal/{clientToken}` (simpler, no wildcard DNS needed). Recommend path-based for Phase 4; subdomain branding can be added post-launch.

**React-PDF reports:** The monthly report is a single `<Document>` React-PDF component. Rendered server-side in a Next.js Route Handler, streamed as `application/pdf`. Also exposed as a web view (same data, standard React components). Run via an Inngest monthly cron function per active client.

### Dependencies

- Phase 1 (drafts table, client schema)
- Phase 0 (R2 for client logo uploads, Clerk for SMM auth)
- Resend account + domain verification
- Twilio account + phone number (for SMS)
- Wife deliverable: monthly report template structure

### Acceptance Criteria

- SMM marks a post "ready for client" → client receives email with magic link within 60s
- Client opens link on mobile → sees posts in a mobile-optimized layout → can approve or request changes with a comment
- Approved post moves to `scheduled` status in SMM UI
- Comment thread is visible to both SMM and client
- Monthly report PDF generates for a client with 10 posts (placeholder metrics)
- Portal URL shows client's logo and primary color
- Magic-link token expires after 15 min; expired token shows a clear "link expired" message with a re-send option
- Token is single-use; second click shows "link already used" with a re-send option
- Portal passes WCAG 2.1 AA: keyboard navigation for approve/reject, sufficient color contrast, screen-reader labels on all interactive elements

### Estimated Complexity

High — the portal auth flow, mobile-first UI, and state machine are each non-trivial. React-PDF requires careful layout work.

### Definition of Done

- Wife tests the portal on mobile (iPhone Safari) and approves UX
- Magic-link auth security reviewed: 15 min token expiry, single-use enforcement, HttpOnly + SameSite=Lax cookie
- State machine handles all valid transitions; invalid transitions return 422
- Monthly report renders correctly for 0 posts, 10 posts, and 50 posts
- Portal passes WCAG 2.1 AA audit (`axe-core` in Playwright E2E, zero critical violations)
- Sentry confirmed capturing errors in the `(portal)` route group

### Testing Strategy

- **Unit:** State machine transition logic; magic-link token sign/verify; HMAC expiry
- **Integration:** Full magic-link flow (generate → send via Resend test mode → validate → cookie set); comment thread CRUD with workspace isolation
- **E2E:** SMM marks post ready → email received (Resend test) → client approves → SMM sees approved status; report generation produces valid PDF

### Risks and Unknowns

- Vercel wildcard domains require Vercel Pro plan. If path-based portal is chosen (recommended for Phase 4), this is not an issue.
- Twilio SMS: requires a phone number purchase + A2P 10DLC registration in the US. Registration takes 2–4 weeks. Start registration early if SMS is in Phase 4 scope; otherwise defer SMS to post-launch.
- React-PDF rendering on Vercel Edge: React-PDF v4+ supports server-side rendering; confirm it works in a Vercel serverless function (not Edge Runtime, which lacks Node APIs).

---

## 10. Phase 5 — Meta Integration

**Estimated duration:** 1–2 weeks (Weeks 18–19, assuming Meta app review approved)

### Deliverables

- Instagram Business Account OAuth connection (per client)
- Scheduled publishing via Meta Graph API: single image, carousel, Reels (with cover frame selection), Stories
- Post status sync (published | failed | processing)
- Performance data sync: reach, impressions, saves, follower count — stored per post + per period
- Post status shown in SMM UI and calendar

### File/Module Structure (additions)

```
packages/meta/
└── src/
    ├── auth.ts                           # OAuth 2.0 flow for IG Business
    ├── publisher.ts                      # Graph API publish calls
    ├── scheduler.ts                      # Inngest scheduled function: check + publish due posts
    └── sync.ts                           # Inngest cron: pull performance data daily

packages/db/
└── src/schema/
    ├── instagram-accounts.ts             # OAuth tokens (encrypted), account_id
    └── post-metrics.ts                   # reach, impressions, saves per post + period
```

### Key Implementation Notes

**OAuth token storage:** Access tokens are encrypted at rest (`AES-256-GCM`, key in env var). Never logged. Refresh token handling: Instagram long-lived tokens last 60 days; refresh via Inngest cron 10 days before expiry. **Post-launch improvement:** Vercel encrypted env vars are decrypted at runtime and are not a KMS. For a production hardening pass, migrate the encryption key to a proper KMS (AWS KMS or Doppler). Defer to after initial launch; flag it in the Phase 7 launch checklist.

**Publishing flow:** When a post reaches `scheduled` status with a publish time in the past, the Inngest scheduler picks it up. Flow: validate token → upload media to IG Containers API → wait for container processing → publish → update post status. All steps are `step.run()` for idempotency; if the publish step fails after media upload, retry does not re-upload.

**Carousel posts:** Each image uploaded as a separate Container, then combined via `POST /v{n}/{ig-user-id}/media` with `media_type=CAROUSEL` and child `creation_id` array.

### Dependencies

- Meta app review approved (external dependency, submitted Phase 0)
- Phase 1 (drafts/posts table)
- Phase 4 (scheduled status in state machine)

### Acceptance Criteria

- SMM can connect an Instagram Business Account via OAuth
- A scheduled post publishes at the correct time (±5 min)
- Carousel (3 images) publishes correctly
- Failed publish surfaces error reason in SMM UI
- Performance data syncs daily; metrics visible in the client's post list

### Estimated Complexity

Medium — Graph API is well-documented but has quirks (container processing time, carousel ordering, Stories API limitations).

### Definition of Done

- End-to-end publish test with a real Instagram Business Account in test mode
- Token refresh Inngest cron confirmed working (can simulate 60-day expiry in test)
- Performance sync running daily without errors

### Testing Strategy

- **Unit:** OAuth token encrypt/decrypt; retry logic for container processing wait
- **Integration:** Mock Graph API responses for all publish types
- **E2E:** Full publish flow (scheduled post → Inngest picks up → publishes → status updates in UI)

### Risks and Unknowns

- Meta app review may still be pending. If not approved by Week 18, delay Phase 5 and advance Phase 6 (trends + reports) which has no Meta dependency.
- Stories API: limited scheduling support in Graph API. Stories may need to be published immediately rather than scheduled. Flag this in the UI.
- Rate limits: Meta Graph API has per-account rate limits. Build in exponential backoff from day one.

---

## 11. Phase 6 — Trends + Reports

**Estimated duration:** 3–4 weeks (Weeks 20–23)

### Deliverables

- Trend analysis: Reddit (r/therapists, r/therapy, r/mentalhealth, r/psychotherapy) + curated RSS (Psychology Today, APA news, NIMH) — Google Trends excluded from v1 (unofficial API, no SLA, breaks on Google changes; Reddit + RSS is sufficient signal)
- Weekly trend synthesis per client (Inngest weekly cron)
- Niche relevance filter: trends filtered against mental health content pillars
- Trend UI: weekly digest per client with suggested post angles
- Monthly client reports: finalized with real Meta metrics (requires Phase 5), pillar breakdown, top performers, follower growth chart
- Report delivery: auto-send as PDF + web link to client email on the 1st of each month

### File/Module Structure (additions)

```
packages/trends/
└── src/
    ├── sources/
    │   ├── reddit.ts                     # Reddit API (OAuth, public endpoints)
    │   └── rss.ts                        # RSS parser for curated publications
    ├── synthesizer.ts                    # Claude Agent SDK trend synthesis workflow
    └── relevance-filter.ts               # Embedding similarity vs. niche pillars

packages/inngest/
└── src/functions/
    ├── weekly-trends.ts                  # Cron: every Monday, synthesize trends
    └── monthly-reports.ts                # Cron: 1st of month, generate + send reports
```

### Key Implementation Notes

**Trend synthesis (Claude Agent SDK):** Tools: `search_reddit(subreddit, query)`, `fetch_rss_feed(url)`. Agent synthesizes: top 5 trending topics this week + suggested content angles for each, filtered for mental health practice relevance. Output stored in `weekly_trend_digests` table.

**Reddit integration:** Use the official Reddit API (OAuth2 app). Public subreddit data does not require user auth. Rate limit: 60 requests/minute per OAuth client. Cluster topic extraction via embedding similarity + simple centroid clustering over post titles.

### Dependencies

- Phase 2 (RAG: niche knowledge base for relevance filtering)
- Phase 5 (Meta metrics for final report data)
- Wife deliverable: monthly report template

### Acceptance Criteria

- Weekly digest generated every Monday for each active client
- Trending topic "anxiety in the workplace" surfaces in digest with 2+ suggested post angles
- Irrelevant trend (e.g., sports news) filtered out by niche relevance filter
- Monthly report PDF includes real reach/impressions from Meta sync
- Report auto-emailed on the 1st with correct branding

### Estimated Complexity

Medium — trend sources (Reddit API + RSS) are straightforward; synthesis prompt quality is the main complexity.

### Definition of Done

- Trends cron runs without errors for 2 consecutive weeks in staging
- Monthly report renders correctly with real metrics
- Wife approves the trend digest format and the report template

### Testing Strategy

- **Unit:** Relevance filter embedding threshold; RSS parser for known feeds
- **Integration:** Trend synthesis workflow against mocked API responses; report generation with seed metrics
- **E2E:** Weekly digest appears in UI on Monday; monthly report PDF delivered to test email

### Risks and Unknowns

- Reddit API: requires app registration. Rate limits (60 req/min) are generous for this use case but monitor. If Reddit changes their API pricing again (as they did in 2023), this source may need replacement — RSS feeds are the fallback.
- RSS feed reliability: curated feeds (Psychology Today, APA, NIMH) are stable but can go stale or change URLs. Monitor monthly; add a dead-feed alert to the Inngest cron.

---

## 12. Phase 7 — Billing, Onboarding, Launch Prep

**Estimated duration:** 2–3 weeks (Weeks 24–26)

### Deliverables

- Stripe billing integration: subscription tiers (Starter/Growth/Agency), usage metering for AI credits, webhook handling
- Paywall / feature gating: per-tier feature flags enforced server-side
- Onboarding flow: workspace setup wizard (add first client, upload brand assets, run first generation)
- Marketing site: Next.js (same repo, `(marketing)` route group), niche-specific copy, pricing page
- Docs site or in-app help: key workflows documented
- Launch checklist: security review, Sentry error rate baseline, Neon + Vercel production settings

### Key Implementation Notes

**Stripe:** `stripe.subscriptions` + `stripe.usage_records` for AI credit metering. Webhook handler at `/api/v1/webhooks/stripe` processes: `customer.subscription.updated`, `invoice.payment_failed`, `invoice.paid`. Feature gating: `workspace.plan` enum (`starter | growth | agency`) updated on webhook, checked via a `requirePlan(plan)` middleware in API routes.

**AI credit metering:** Every LLM call logs token count to `llm_usage_log`. A daily Inngest cron aggregates and reports usage to Stripe. Hard limits enforced per tier (e.g., Starter: 50K tokens/day).

### Dependencies

- All previous phases
- Stripe account + pricing configured
- Legal: terms of service, privacy policy (HIPAA-adjacent disclaimer required)

### Acceptance Criteria

- New user can sign up, choose a plan, and run a generation in <10 minutes
- Downgraded workspace loses access to gated features immediately
- Stripe webhook handles payment failure by suspending workspace
- Marketing site passes Core Web Vitals (LCP <2.5s, CLS <0.1)

### Estimated Complexity

Medium

### Definition of Done

- Stripe integration tested with Stripe test mode (all webhook events)
- Onboarding flow tested with 3 new users (including wife's fresh account)
- Security checklist completed (see cross-cutting concerns)
- Production Neon + Vercel settings confirmed (connection pooling, compute sizing)

### Testing Strategy

- **Unit:** Feature gate middleware; usage aggregation math
- **Integration:** Stripe webhook handler for all subscription events
- **E2E:** Full onboarding (sign up → select plan → add client → generate → approve → [mock] publish)

### Risks and Unknowns

- HIPAA-adjacent compliance: this product handles content _about_ mental health but not PHI. Confirm with a lawyer that HIPAA BAA is not required. If any client uploads anything that could be PHI (e.g., session notes), the product scope and data handling obligations change significantly. This is a launch blocker if unresolved.

---

## 13. Parallel Track — Standalone Scraper CLI

**Estimated duration:** 1–2 days (run during any phase with spare capacity)

### Deliverables

- Separate repo (e.g., `smm-scraper-cli`)
- Node.js CLI using Playwright for authenticated scraping
- Target: carolineflett.com (course platform, paid credentials)
- Output: transcripts as markdown files in a local `./output/` directory
- Manual ingestion: you copy selected files into your workspace as "personal notes"

### Key Implementation Notes

- Playwright with `--headed` or `--headless` per course platform requirements
- Auth via environment variables (`COURSE_EMAIL`, `COURSE_PASSWORD`) — never committed
- Output format: `{date}-{course-slug}-{module-slug}.md` with frontmatter
- No deployment, no CI, never referenced from main product repo

### Definition of Done

- CLI runs on your machine: `npx ts-node cli.ts scrape --course carolineflett`
- Outputs clean markdown transcripts for all available modules
- `.env.example` documents required credentials; `.gitignore` excludes `.env` and `output/`

---

## 14. Risks and Open Questions (Consolidated)

| #   | Risk                                            | Likelihood              | Impact                          | Mitigation                                                                                                                                           |
| --- | ----------------------------------------------- | ----------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Meta app review rejected/delayed                | High (first submission) | High (Phase 5 blocked)          | Submit early; prepare for one rejection cycle; advance Phase 6 if Phase 5 is blocked                                                                 |
| 2   | Compliance false positive rate frustrates users | Medium                  | High (core differentiator)      | Budget wife's time for 2–3 critic tuning sessions; track FP/FN explicitly from day one                                                               |
| 3   | Neon RLS + connection pooling mismatch          | **Resolved**            | High (data leak risk)           | Explicit `workspace_id` query conditions (not session vars); pattern documented in `packages/db/RLS.md`; CI isolation test gates every schema change |
| 4   | Semantic chunking quality insufficient          | Medium                  | Medium (RAG quality degrades)   | Tune threshold against eval set; keep recursive chunking as fallback per source type                                                                 |
| 5   | Google Trends API breaks                        | N/A — excluded from v1  | N/A                             | Google Trends removed from Phase 6 scope; Reddit + RSS is sufficient signal for v1                                                                   |
| 6   | Wife's content deliverables delayed             | Medium                  | High (Phase 1/2 blocked)        | Agree delivery dates before Phase 0 ends; prioritize niche hook library + 5-state rules as the two blockers                                          |
| 7   | Anthropic rate limits under load                | Low                     | Medium                          | Add Inngest-based request queue from Phase 1; monitor via `llm_usage_log`                                                                            |
| 8   | HIPAA scope creep                               | Low                     | Very High                       | Confirm with a lawyer before launch that no PHI is handled; add explicit upload restrictions in the product                                          |
| 9   | Twilio A2P registration delay                   | Medium                  | Low (SMS is optional)           | Start registration in Phase 4; if not ready, SMS launches post-v1                                                                                    |
| 10  | Google Drive OAuth app verification             | Medium                  | Low (Drive is one of 6 sources) | Submit Drive OAuth verification early; all other sources work without it                                                                             |
| 11  | React-PDF on Vercel serverless                  | Low                     | Medium                          | Verify in Phase 4 spike that React-PDF v4 renders correctly in a Vercel serverless function                                                          |
| 12  | Voyage AI pricing at scale                      | Low                     | Medium                          | voyage-3 is ~$0.06/1M tokens; at 10 customers × 10K chunks/day = ~$0.06/day. Not a concern until 1000+ customers.                                    |

### Open Questions (Need Answers, Not Blocking)

- **Stripe pricing tiers:** What feature gates separate Starter/Growth/Agency? Decide before Phase 0 schema migration (plan enum).
- **Expand to fitness/wellness in v2:** Does the compliance system need to be extensible to different niche rule sets from day one, or is mental-health-only acceptable for v1? (Current architecture handles this via the `niche_id` column in rules — already extensible.)
- **Team expansion:** Any plan to hire before launch? If yes, Phase 0 should include a proper branching + PR review workflow, not just main-branch commits.
- **Customer support tooling:** When an SMM reports "my generation is broken," you need visibility into their audit log and the ability to replay the generation. An internal admin UI is the right tool. Defer to post-launch, but design the audit log schema in Phase 1 so the data is there when needed — do not design it only for compliance export.
- **Neon PITR backup window:** Verify backup retention for your chosen Neon plan before Phase 5 (first real production data). Free = 24h, Launch = 7 days, Scale = 30 days. Decide acceptable RPO and pick plan accordingly.

---

## 15. First Two Weeks — Day-by-Day

### Week 1 — Phase 0 Skeleton

| Day | Tasks                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Init pnpm + Turborepo monorepo. Create `apps/web` (Next.js 15). Install Tailwind + shadcn/ui. Install Clerk. Verify `pnpm dev` runs.                                                                                                                                                                           |
| 2   | Neon project created. Install Drizzle + Neon serverless driver. Write `packages/db` schema: `workspaces`, `users`, `workspace_members`, `clients`. Run first migration.                                                                                                                                        |
| 3   | Wire Clerk Orgs → workspace creation hook (`organizationCreated` webhook → insert workspace row). Middleware enforces auth on `(app)` route group. Verify Clerk sign-up creates workspace in DB.                                                                                                               |
| 4   | **RLS + pooling spike:** implement explicit `workspace_id` query condition pattern in Drizzle. Verify it works through Neon PgBouncer (transaction mode). Write cross-workspace isolation integration test. Document pattern in `packages/db/RLS.md`. Set up Neon CI branch in GitHub Actions. Install Sentry. |
| 5   | Inngest client + dev server. Add `api/inngest/route.ts`. Write smoke-test Inngest function. Cloudflare R2 bucket created; presigned upload/download helpers in `packages/storage`.                                                                                                                             |

### Week 2 — Phase 0 Complete + Phase 1 Begins

| Day | Tasks                                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 6   | Basic CRUD API routes: `POST /api/v1/clients`, `GET /api/v1/clients`, `PATCH /api/v1/clients/:id`. Zod schemas. OpenAPI spec scaffolding. Client list UI.                                        |
| 7   | Compliance rules engine schema. `compliance_rules` table migration. `crisis_resources` table seeded with 988 + Crisis Text Line. `packages/compliance` skeleton (empty rule runner).             |
| 8   | **Meta app submission:** Write use case description + record Loom walkthrough of the Phase 0 UI. Submit to Meta for Business Platform review.                                                    |
| 9   | **Phase 1 starts:** Install Anthropic SDK. `packages/ai` scaffold. Write hook generator prompt (system + user). Wire first API route: `POST /api/v1/clients/:id/generate/hooks`. Test with curl. |
| 10  | Hook generator UI: topic input → streaming hook list → select hooks. Prompt cache applied to system prompt block. Verify cache hit in Anthropic dashboard.                                       |

---

_Plan version: 1.1 — 2026-05-20. Revised per Opus 4.7 review: Inngest-for-Temporal documented as confirmed stack change (not an implicit substitution); timeline adjusted to 28–36 weeks; RLS pooling pattern resolved; Phase 2 duration revised to 6–8 weeks; magic-link token tightened to 15 min; Google Trends excluded from v1; yt-dlp removed from product; ingestion failure modes added; data retention, content export, rate limiting, and accessibility added as cross-cutting concerns._
