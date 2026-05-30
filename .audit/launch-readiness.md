# smm-therapy — Launch-Readiness Checklist

**Audited:** 2026-05-27
**Audit basis:** Full codebase exploration (236 TS files, 11 packages + apps/web) + locked product spec (1031 lines) + 11 phase plans + operations runbook + post-Phase-2 review findings.

Use this as a runnable checklist. Items are sorted by priority: **P0** blocks launch entirely; **P1** must ship before paying customers touch the product; **P2** before scaling beyond ~5 early customers; **P3** can wait.

Each item cites a code file:line or a discrepancy ID (`D#` → see `.audit/doc-code-discrepancies.md`).

---

## P0 — Cannot launch without these

### Security / data integrity

- [ ] **Fix the Instagram OAuth CSRF vulnerability.** Same pattern Drive had before the 2026-05-27 iterative review. Port the HMAC sign/verify pattern from `apps/web/app/api/v1/workspace/google-drive/connect/oauth-state.ts` and the `requireWorkspace()` callback check to the IG flow at `apps/web/app/api/v1/clients/[clientId]/instagram/connect/oauth-state.ts` and `…/callback/route.ts`. Add `OAUTH_STATE_SECRET` to env. See **D6**, and `docs/superpowers/plans/2026-05-27-phase-2-review-followups.md` for the ready patch.
- [ ] **Add workspaceFilter to the 9 Inngest queries that bypass tenant scoping.** Especially `ig-metrics-sync.ts:26` (global draft scan), `monthly-reports.tsx:{120,143,159}`, `calendar-generate.ts:{63,68}`, `ig-publish.ts:{46,51}`. See **D14**.
- [ ] **Confirm no PHI handled — get written legal sign-off.** Spec section 14 risk #8 ("HIPAA scope creep") flags this as "Very High Impact" launch blocker if unresolved. Required: ToS + Privacy Policy + an explicit upload-restriction clause; legal review confirming HIPAA BAA is not required for this product's scope.

### Runtime correctness

- [ ] **Fix Stripe API version mismatch.** `apps/web/lib/stripe.ts:8` pins `2025-04-30.basil`; installed SDK expects `2026-04-22.dahlia`. `sub.current_period_end` is no longer top-level — webhook handler at `apps/web/app/api/webhooks/stripe/route.ts:{45,54,82}` returns undefined at runtime, breaking workspace→plan mapping. Subscription state will never update. See **D5**.
- [ ] **Replace `from: "noreply@yourdomain.com"` in 5 places + verify Resend domain.** All 4 templates in `packages/notifications/src/email.ts` + `packages/inngest/src/functions/monthly-reports.tsx:253` (which also re-instantiates Resend instead of using `@smm/notifications` — fix that too). Verify sending domain in Resend (DKIM/SPF, up to 48h DNS). Without this, NO email flows work: magic-link, review-request, approval, changes-requested, monthly reports. See **D4**.
- [ ] **Decide brand name + run the rename.** Spec section 2 item 6 flagged this as blocking before Day 1. Code still hardcodes "TherapyContent" in `apps/web/app/(marketing)/{layout,page}.tsx` + scripts/setup. Affects domain purchase, Vercel naming, Resend domain (chains into the email fix above). See **D13**.

### Patient-safety

- [ ] **Add `detectCrisis()` to the captions generation route.** Spec line 71 mandates crisis detection runs pre-critic on every generation. Currently only hooks route does it; captions route at `apps/web/app/api/v1/clients/[clientId]/generate/captions/route.ts` does not. For a mental health product this is a launch-blocking safety gap. See **D9**. Add a unit test asserting suicidal-ideation topic triggers crisis branch.

### External-timer dependencies (start these now even if everything else is ready)

- [ ] **Submit Meta App Review.** Permissions required: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`. Lead time 1–2 weeks (4-6 weeks per spec; first submission typically rejected). Until approved, Instagram publishing only works for accounts added as **Testers** in the Facebook App dashboard. Runbook section 4c.
- [ ] **Verify Resend sending domain.** DKIM + SPF DNS records. Can take up to 48h to propagate. Runbook section 7.
- [ ] **Submit Google Drive OAuth verification** if you want `drive.readonly` scope to work for users outside your Google Cloud Console "test users" list. Spec risk #10.

### Documentation needed before users follow the runbook

- [ ] **Fix runbook Section 6.** It tells users to edit `apps/web/proxy.ts` — that file was renamed to `apps/web/middleware.ts` in commit 38181c3. Anyone following the runbook today either edits a nonexistent file or recreates the original auth-bypass bug. See **D1**.
- [ ] **Add the 4 missing env vars to the runbook + create `apps/web/.env.example`.** Missing from the runbook entirely: `OAUTH_STATE_SECRET`, `GOOGLE_DRIVE_CLIENT_ID`, `GOOGLE_DRIVE_CLIENT_SECRET`, `GOOGLE_DRIVE_TOKEN_KEY`. And the spec promises `.env.example` exists; it doesn't. See **D2**, **D3**.

---

## P1 — Must ship before paying customers

### Core UX gaps

- [ ] **Build the `/clients` list page.** Currently shows placeholder "No clients yet. Phase 1 will add client creation UI." Users created via the onboarding wizard have no UI to add a second client or see existing ones. See **D18**.
- [ ] **Build the `/clients/[id]` overview page.** Currently 404s. Subroutes (`/brand-voice`, `/calendar`, `/drafts`, etc.) exist but no landing page. See **D19**.
- [ ] **Build the knowledge-base upload UI.** The page at `/clients/[id]/knowledge` literally says "Use the API to ingest content". Backend exists (`/api/v1/clients/[id]/knowledge-bases/[id]/upload-url` returns presigned R2 URL; POST `/documents` registers the doc); UI needs file-picker + URL-input modes. See **D20**.
- [ ] **Build a dashboard worth the name.** Currently `/dashboard` shows only the workspace name from `orgSlug`. Minimum useful: client count, drafts-in-review count, posts-published-this-week, recent-activity feed. See **D17**.
- [ ] **Add `/settings/billing` to the sidebar.** Phase 7 built the page but never linked it; users can only reach it by typing the URL. `apps/web/components/app-sidebar.tsx`. See **D25**.

### Domain-expert / data deliverables (wife per spec)

- [ ] **Populate `NICHE_EXAMPLES` with real hook patterns.** `packages/ai/src/templates/niche-examples.ts` currently has 8 bracket-placeholder templates (`"What your [symptom] is actually telling you"`) that get injected into the system prompt verbatim. Users see literal placeholders. Spec calls for 30–50 real patterns.
- [ ] **Populate the RAG eval set.** `packages/eval/src/eval-set/niche-mental-health.json` is `v0.1-placeholder` with 3 synthetic pairs. The `pnpm eval` 0.75 recall@5 threshold gate is meaningless until populated with 50–100 hand-curated pairs (spec section 4 Phase 2). See **D12**.
- [ ] **Expand compliance state coverage from 5 states.** Only CA, NY, TX, FL, IL have state-specific rules; the rest of the US gets APA-universal rules only. At minimum, block signups from unsupported states with a clear "your state isn't fully supported yet" message in onboarding, OR ship the remaining 45 states. See **D10**.
- [ ] **Add credential-specific rules for PsyD / PhD / MD.** State rules currently target only LCSW/LMFT/LPC. Practitioners with doctoral credentials get the universal-APA layer only. See **D11**.

### Compliance + audit integrity

- [ ] **Write a `generation_audit` row in the captions route.** Hooks route writes it; captions route does not. Audit trail has a captions-shaped hole. Spec section 3.2 calls audit "Immutable. SMM can export this if questioned by a licensing board." See **D21**.
- [ ] **Stop hardcoding `complianceApproved: true` on manual draft saves.** `POST /api/v1/clients/[id]/drafts` bypasses the critic when the SMM saves a manually-edited caption. Either run the critic, or surface this bypass in UI with explicit acknowledgment. See **D22**.

### Setup automation

- [ ] **Run the interactive setup CLI end-to-end on a fresh deploy.** `pnpm setup` walks secrets → migrations → Stripe → Clerk → Resend → branding. Test the `--ci` path too if you'll use it in CI. After the brand-name decision lands, this single command replaces ~60% of the runbook.
- [ ] **Apply DB migrations on production Neon.** 7 migration files in `packages/db/migrations/`. Verify schema matches `packages/db/src/schema/`.
- [ ] **Create Stripe products + register webhook in production.** Two products: Growth $99/mo, Agency $299/mo. Webhook events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Runbook section 3.
- [ ] **Register Clerk webhook + configure post-signup redirect.** Sign-up redirect → `/setup`; sign-in redirect → `/dashboard`. Runbook section 6 (after applying the proxy.ts → middleware.ts fix).
- [ ] **Set `STRIPE_PRICE_GROWTH` and `STRIPE_PRICE_AGENCY`.** Code at `apps/web/lib/stripe.ts:14-15` falls back to placeholder strings `"price_growth_monthly"` / `"price_agency_monthly"` if env unset — checkout will fail mysteriously.

### Plan enforcement gaps

- [ ] **Add client-count gate to `POST /api/v1/clients`.** Starter is supposed to limit to 1 client; growth to 5. Currently no enforcement at create time — users on any plan can add unlimited clients. The `@smm/features` helpers (`clientLimit`, `isWithinClientLimit`) exist; just aren't called.
- [ ] **Add `instagram_publishing` plan gate.** Per spec, only agency plan publishes to IG. The `instagram/publish` Inngest event has no plan check before queueing.

---

## P2 — Must ship before scaling beyond ~5 customers

### Cost / reliability of paid operations

- [ ] **Set `retries: 1` on `trend-sync`.** Currently undeclared → Inngest defaults to 4 → a failing Claude synthesize step burns up to 4× the cost. See **D24**.
- [ ] **Rate-limit / batch `monthly-reports`.** Cron fires once on the 1st and synchronously emails every client. At 50 clients you'll hit Resend's per-second cap. Consider per-client fan-out (one Inngest event per client) or a sleep between sends.
- [ ] **Add idempotency on `calendar-generate` draft inserts.** No unique key on `(calendarJobId, postIndex)` — partial-step retries can create duplicate drafts. Add a unique index on `drafts` covering those two columns.

### Observability

- [ ] **Replace bare `catch {}` in `ig-metrics-sync.ts:73`.** All per-draft metric fetch failures silently no-op — expired tokens, throttled APIs, deleted media are invisible. At minimum log via `step.run` so Inngest dashboard surfaces them. See **D23**.
- [ ] **Add startup validation for env vars.** Pattern: `if (!process.env.X) throw new Error(...)` at module load. Currently most modules use non-null assertions, failing at call time. Specifically: `packages/storage` (4 R2 keys), `packages/ai` (Anthropic + Voyage keys), `@smm/notifications` (Resend key). See **D31**.
- [ ] **Add retry/backoff on Anthropic + Voyage calls.** Transient 429/503 fails the generation route immediately. Even a simple `[1s, 4s, 16s]` backoff would absorb the typical transient. Currently zero retries.
- [ ] **Log when `voyageRerank` falls back to RRF order.** `packages/rag/src/rerank.ts:31` silently returns the pre-rerank order if `data: []` — masks misconfigured key.

### Accessibility

- [ ] **Fix the broken axe-core import in `tests/e2e/portal.spec.ts:2`.** Spec mandates WCAG 2.1 AA on the portal route group from Phase 4 day one; test exists but doesn't compile. Likely fix: `import checkA11y from "@axe-core/playwright"` (default import). See **D15**.

### Hygiene

- [ ] **Onboarding wizard completion guard.** `/setup` doesn't check whether setup is done — re-entering it can create a second "first client". See **D26**.
- [ ] **Handle `organization.deleted` in Clerk webhook.** Currently only `created` + `updated` — orphan workspaces accumulate. See **D29**.
- [ ] **Workspace export filters soft-deleted rows.** `/api/v1/workspace/export` returns tombstones. See **D28**.

---

## P3 — Nice-to-have / post-launch

- [ ] **Replace polling on calendar generate with real-time job status.** UI polls for 8 seconds then gives up.
- [ ] **Extract `packages/reports`.** Spec promised it; code put React-PDF inside `packages/inngest/src/functions/monthly-reports.tsx`. Refactor when convenient. See **D8**.
- [ ] **Document or replace Postgres-backed rate limiting.** Spec says Upstash Redis; code uses Postgres `rate_limit_hits`. Works fine at launch scale; will be a bottleneck. Either update spec section 3.9 or migrate to Upstash. See **D7**.
- [ ] **Add `@smm/features` and `@smm/inngest` to `vitest.config.ts` aliases.** See **D27**.
- [ ] **Cross-process Drive refresh-token lock.** Currently in-process Promise dedup only (added in 2026-05-27 iterative review). Cross-process race is rare; full fix needs WebSocket driver or a `refresh_lock` column. Documented in `docs/superpowers/plans/2026-05-27-phase-2-review-followups.md` (L4).
- [ ] **Embed-stage idempotency.** Inngest retries currently re-embed; H7 followup proposes decomposing pipeline into `step.run()` boundaries. See followups doc.
- [ ] **Drop `"parsing"` from `documentStatusEnum`** (never written by the pipeline) — followups H8.
- [ ] **Move `"jsx": "react-jsx"` to package-level compilerOptions in `packages/inngest/tsconfig.json`** so root `tsc --noEmit` stops reporting false JSX errors. See **D32**.
- [ ] **Decide v1 fate of Twilio SMS.** Stub exists but root CLAUDE.md doesn't even list Twilio in the stack. Either ship SMS or archive the stub. See **DC2**.
- [ ] **`scripts/setup/index.ts` CI flag for Resend domain.** Add `--resend-domain <name>`. See **D30**.

---

## What's already solid (don't re-litigate)

These verified-working pieces shouldn't get prioritized for "improvement" before the P0/P1 list is done:

- Core generation loop (hooks → captions → save) works end-to-end with rate-limiting, RAG grounding, compliance critic, audit log (hooks), citations
- Magic-link portal flow: auth + approve + comment + request-changes all wired
- Drive OAuth (post-2026-05-27 iterative-review): HMAC-signed state, workspace match, pagination, per-file try/catch, in-process refresh dedup
- Phase 2 ingestion pipeline (post-c7cc3c9 + post-review): idempotent chunk store, soft-delete guard, semantic→recursive fallback
- Cross-client RAG isolation: enforced + regression test at `tests/integration/rag/isolation.test.ts`
- Stripe webhook signature verification (the API-version issue above is separate)
- Clerk webhook signature verification (`svix`)
- AES-256-GCM token encryption with per-provider keys, ≥64-hex validation
- Onboarding wizard 3-step flow (functional; needs the completion guard)
- Marketing landing page (functional; needs brand-name swap)
- Billing UI (full Stripe checkout + customer portal redirect)
- Trend digest page renders correctly

---

## Critical-path order of operations

If you want to ship the fastest credible launch:

**Week 1 — security + correctness + email**

1. Day 1: IG OAuth CSRF fix (port from Drive). Submit Meta App Review same day.
2. Day 1: Stripe API version fix.
3. Day 1: Crisis detection on captions route.
4. Day 2: Decide brand name. Verify Resend domain (kicks off 24-48h DNS clock).
5. Day 2: Replace `noreply@yourdomain.com` in 5 places.
6. Day 3: Workspace-scoping fixes in 4 Inngest functions.
7. Day 3: Runbook fix (proxy → middleware) + 4 missing env vars added + `.env.example` created.

**Week 2 — wife deliverables + UX gaps in parallel**

- Wife track: real NICHE_EXAMPLES + 50-pair eval set + expanded state rules
- Engineering track: clients list, client overview, knowledge upload UI, dashboard, sidebar billing link, captions audit row, manual-draft critic, client-count gate

**Week 3 — legal + Meta + scaling prep**

- ToS + Privacy Policy with HIPAA-adjacent disclaimer signed off
- Meta App Review resubmission if first round rejected
- P2 cost/observability items
- Final dry run with `pnpm setup` against a fresh production deploy

**Week 4 — soft launch with 1–2 friendly customers**

- Wife as customer 1
- Watch Sentry + Inngest dashboards for first-week-in-production issues
- Defer P3 items unless they manifest

---

## Open questions requiring user decisions

These are not engineering tasks; they're decisions the engineering tasks depend on.

1. **Brand name + domain.** Blocks Resend, Vercel naming, marketing copy, Clerk branding. Spec section 2 item 6.
2. **HIPAA legal sign-off path.** Spec risk #8: "Very High Impact" launch blocker if unresolved. Engage a lawyer, or constrain product scope explicitly (no session-notes uploads, etc.).
3. **State coverage policy.** Ship 50-state on day one, OR block unsupported-state signups with explicit messaging?
4. **SMS in v1?** Twilio stub exists; root docs don't list it. Ship or archive.
5. **Drive OAuth verification.** Submit verification for Drive? Or accept the "<100 users" unverified-app limit?
6. **Customer-support tooling deferral?** Spec section 14 open question #4: an internal admin UI is "the right tool" but deferred to post-launch. Confirm.
