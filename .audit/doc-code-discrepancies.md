# Documentation ↔ Code Discrepancies — 2026-05-27

Method: Each finding cites a doc quote + a code file:line. Severity reflects launch impact, not aesthetics.

## CRITICAL (blocks launch or causes runtime failure)

### D1 — Runbook references a renamed file (Clerk middleware setup will not work as documented)

- **Doc says:** `docs/manual-tasks/2026-05-21-post-implementation-setup.md:282-296`
  > "**Where:** `apps/web/proxy.ts` — open in your editor … Update the after-sign-up redirect"
- **Code state:** `apps/web/middleware.ts` exists; `apps/web/proxy.ts` does not. Commit 38181c3 message: _"fix: rename proxy.ts to middleware.ts so Clerk auth enforcement actually runs"_.
- **Verdict:** OUTDATED
- **Fix:** Update Section 6 of the runbook to reference `apps/web/middleware.ts`. Anyone following the runbook today edits a nonexistent file or recreates the bug the rename fixed.

### D2 — Runbook missing 4 env vars required by code

- **Doc says:** `docs/manual-tasks/2026-05-21-post-implementation-setup.md:33-89` — lists 17 env vars
- **Code state:**
  - `apps/web/app/api/v1/workspace/google-drive/connect/oauth-state.ts:13-17` requires `OAUTH_STATE_SECRET` (≥32 chars)
  - `packages/ingestion/src/sources/google-drive-token.ts:9-17` requires `GOOGLE_DRIVE_TOKEN_KEY` (≥64 hex)
  - `apps/web/app/api/v1/workspace/google-drive/connect/route.ts:15-25` requires `GOOGLE_DRIVE_CLIENT_ID` and `GOOGLE_DRIVE_CLIENT_SECRET`
- **Verdict:** INCOMPLETE
- **Fix:** Add the 4 vars to runbook Section 1 with generation instructions.

### D3 — No `.env.example` exists despite extensive env-var inventory

- **Spec says:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md:78` and `:285-287`
  > "`PORTAL_SECRET` must be in `.env.example`."
  > "environment variables documented in `.env.example` (including `PORTAL_SECRET`)"
- **Code state:** `find apps -maxdepth 4 -name '.env*' -not -path '*/node_modules*'` returns nothing.
- **Verdict:** FABRICATED (no commit ever added it)
- **Fix:** Create `apps/web/.env.example` with all 20+ env keys + comments.

### D4 — Email sender is a placeholder hardcoded in 5 places

- **Spec implication:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md:78` — magic-link via Resend; `2026-05-20-phase-4-client-handoff.md` Tech Stack lists Resend.
- **Runbook says:** `docs/manual-tasks/2026-05-21-post-implementation-setup.md:318-330` — "update line 7 in `apps/web/lib/email.ts` … replace with your verified domain"
- **Code state (5 occurrences, not 1):**
  - `packages/notifications/src/email.ts` — `from: "noreply@yourdomain.com"` in all 4 templates (sendMagicLinkEmail, sendReviewRequestEmail, sendApprovalConfirmedEmail, sendChangesRequestedEmail)
  - `packages/inngest/src/functions/monthly-reports.tsx:253` — same hardcoded value, in a _separate_ Resend instantiation (not using `@smm/notifications`)
- **Verdict:** INCOMPLETE + the runbook points at the wrong file (`apps/web/lib/email.ts` just re-exports; the real string is in `@smm/notifications`)
- **Fix:** Replace all 5 occurrences; update runbook Section 7 to point at `packages/notifications/src/email.ts`.

### D5 — Stripe API version pinned to wrong version

- **Doc says:** `docs/superpowers/plans/2026-05-20-phase-7-billing-launch.md:360` — Stripe client config used `apiVersion: "2025-04-30.basil"`
- **Code state:** `apps/web/lib/stripe.ts:8` still pins `"2025-04-30.basil"`; installed `stripe` package expects `"2026-04-22.dahlia"`. Typecheck errors confirm `sub.current_period_end` no longer top-level on the Subscription type. Webhook handler reads it at `apps/web/app/api/webhooks/stripe/route.ts:45,54,82` — will return undefined at runtime, breaking the workspace plan → subscription mapping.
- **Verdict:** OUTDATED (was correct when written; SDK upgraded since)
- **Fix:** Update `apiVersion` literal; access `sub.items.data[0].current_period_end` instead of top-level; regenerate tests.

### D6 — Instagram OAuth has the same CSRF vulnerability that Drive OAuth was just patched for

- **Spec says:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md:781` — "Access tokens are encrypted at rest … Never logged."
- **Code state:** `apps/web/app/api/v1/clients/[clientId]/instagram/connect/oauth-state.ts` uses unsigned base64url state (same pattern Drive had before fix in commit pending). The IG callback at `apps/web/app/api/v1/clients/[clientId]/instagram/callback/route.ts` accepts `parsed.clientId` without `requireWorkspace()` re-check.
- **Followup doc:** `docs/superpowers/plans/2026-05-27-phase-2-review-followups.md` flags this as CRITICAL.
- **Verdict:** UNDOCUMENTED + INCOMPLETE
- **Fix:** Port the HMAC-sign helper from `apps/web/app/api/v1/workspace/google-drive/connect/oauth-state.ts` and the `requireWorkspace()` callback pattern to the IG flow. Update `tests/unit/api/ig-oauth-state.test.ts` for the signed format.

## HIGH (functional gaps that affect launch quality)

### D7 — Spec promises Upstash Redis for rate limiting; code uses Postgres

- **Spec says:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md:143-145`
  > "Implementation: a thin `rateLimit(key, limit, window)` helper wrapping Upstash Redis (free tier: 10K requests/day…)"
- **Code state:** `apps/web/lib/rate-limit.ts:1-32` uses Drizzle + Postgres `rate_limit_hits` table. No Upstash dependency. Each `checkRateLimit` call issues a DELETE + COUNT + INSERT against the DB.
- **Verdict:** OUTDATED (intentional choice not back-ported to spec)
- **Fix:** Update spec section 3.9 to reflect Postgres-backed approach. Note: Postgres backend has higher latency per check; acceptable at launch but a known bottleneck at scale.

### D8 — Spec promises a `packages/reports` React-PDF module; code puts it in Inngest functions

- **Spec says:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md:680-684`
  > "packages/reports/src/monthly-report.tsx … Inngest scheduled function (monthly cron)"
- **Code state:** No `packages/reports` exists. `packages/inngest/src/functions/monthly-reports.tsx` contains both the React-PDF component AND the Inngest function — and it re-instantiates Resend instead of using `@smm/notifications`.
- **Verdict:** PARTIAL (functionality exists; layered wrong + duplicates Resend)
- **Fix:** Either accept the deviation and update the spec, or extract `packages/reports`. Lower priority than fixing the duplicate Resend instantiation.

### D9 — Spec says crisis detection runs before compliance critic; code only runs it for hooks

- **Spec says:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md:71`
  > "Crisis detection: Pre-critic step. … This runs even if compliance critic passes."
- **Code state:**
  - `apps/web/app/api/v1/clients/[clientId]/generate/hooks/route.ts` — calls `detectCrisis()` ✓
  - `apps/web/app/api/v1/clients/[clientId]/generate/captions/route.ts` — does NOT call `detectCrisis()`
- **Verdict:** PARTIAL — for a mental health product, this is a safety regression, not a feature gap.
- **Fix:** Mirror the hooks pattern in the captions route. Add unit test asserting crisis branch fires for "suicidal thoughts" caption.

### D10 — Spec says 50-state compliance coverage by Phase 3; code has 5

- **Spec says:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md:180`
  > "Full 50-state compliance rules — Phased: 5 states in Phase 1, full 50 in Phase 3."
- **Code state:** `packages/compliance/src/seed.ts` + the seed DB: 11 total rules; state-specific only CA/NY/TX/FL/IL (5 states). State rules only apply to LCSW/LMFT/LPC credentials.
- **Verdict:** INCOMPLETE — explicitly a domain-expert deliverable per the spec
- **Fix:** Block expansion-to-new-state SMM signups until the relevant state rules ship. Surface "your state isn't fully supported yet" in the onboarding wizard for unsupported states.

### D11 — Spec says LCSW/LMFT/LPC/PsyD/PhD/MD all covered; code only state-rules 3 of 6

- **Spec says:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md:68`
  > "Configurable per state and per credential type (LCSW vs LMFT vs PsyD vs LPC have slightly different rules)."
- **Code state:** State-specific rules in seed.ts target only LCSW/LMFT/LPC. PsyD/PhD/MD signups get APA-universal rules only.
- **Verdict:** PARTIAL
- **Fix:** Add at least one credential-specific rule for each of PsyD, PhD, MD across the 5 launch states.

### D12 — Spec promises 50-100 RAG eval pairs blocking Phase 2 sign-off; code has 3

- **Spec says:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md:175`
  > "RAG eval set (Phase 2 blocker) — 50-100 query/expected-chunk pairs for the niche knowledge base."
- **Code state:** `packages/eval/src/eval-set/niche-mental-health.json` is version `"0.1-placeholder"` with 3 synthetic pairs and a "wife deliverable" TODO comment.
- **Verdict:** INCOMPLETE
- **Fix:** Domain expert deliverable. Without it, the `pnpm eval` 0.75 threshold gate is meaningless.

### D13 — Spec marketing brand name placeholder still in code

- **Doc says:** `docs/manual-tasks/2026-05-21-post-implementation-setup.md:336-353` — "Replace placeholder brand name in marketing page" + spec section 2 item 6 — "Product / brand name (blocking — move up from open questions)"
- **Code state:** `apps/web/app/(marketing)/page.tsx` and `apps/web/app/(marketing)/layout.tsx` use "TherapyContent" as the product name (verified by spec Section 8 of the runbook). Also referenced in `scripts/setup/index.ts` as a setup-time replacement target.
- **Verdict:** PARTIAL (the deferred decision the spec called out as blocking is still deferred)
- **Fix:** Decide brand name → run `pnpm setup --skip-secrets --skip-migrations --skip-stripe --skip-clerk --skip-resend` (only the branding step) or manually grep/replace.

### D14 — Workspace-scoping rule violated in 4 Inngest functions

- **Rule says:** `.claude/rules/workspace-scoping.md:38-43`
  > "Every new query that touches a per-tenant table must include `workspaceFilter(table.workspaceId, workspaceId)` in its WHERE clause."
- **Code state — violations:**
  - `packages/inngest/src/functions/ig-publish.ts:46,51`
  - `packages/inngest/src/functions/ig-metrics-sync.ts:26,49` (global draft scan!)
  - `packages/inngest/src/functions/monthly-reports.tsx:120,143,159`
  - `packages/inngest/src/functions/calendar-generate.ts:63,68`
- **Verdict:** PARTIAL — application enforces scoping in API routes but not consistently in Inngest functions
- **Fix:** Add `workspaceFilter(...)` to each cited query. The metrics-sync global scan is the worst: it touches all workspaces' draft tables in one query.

### D15 — Spec says `WCAG 2.1 AA` for portal from Phase 4 day one; portal axe-core test fails to import

- **Spec says:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md:150-153`
  > "**WCAG 2.1 AA** conformance required on the `(portal)` route group from Phase 4 day one … run `axe-core` in Playwright E2E tests on the portal acceptance criteria suite"
- **Code state:** `tests/e2e/portal.spec.ts:2` — `import { checkA11y } from "@axe-core/playwright"` fails: `TS2614: Module '@axe-core/playwright' has no exported member 'checkA11y'. Did you mean to use 'import checkA11y from "@axe-core/playwright"' instead?`
- **Verdict:** PARTIAL — the test exists but doesn't run.
- **Fix:** Update import to default import or to the current named export of the package version installed.

## MEDIUM (UX / quality)

### D16 — Spec says onboarding redirects to `/setup`; Clerk dashboard config never set up programmatically

- **Doc says:** `docs/manual-tasks/2026-05-21-post-implementation-setup.md:282-305` — Section 6 says to set Sign-up redirect URL to `/setup` in Clerk dashboard
- **Code state:** No programmatic configuration; this is a Clerk dashboard click. Setup CLI in `scripts/setup/index.ts` handles webhook registration but NOT redirect URLs.
- **Verdict:** PARTIAL / runbook still required
- **Fix:** Could be automated via Clerk API but currently isn't. Verify the runbook's Section 6 lands users on `/setup` after fixing D1.

### D17 — Dashboard is a stub

- **Spec implication:** Phase 0 acceptance: dashboard exists. Spec line 220: "(app)/dashboard/page.tsx"
- **Code state:** `apps/web/app/(app)/dashboard/page.tsx` shows only the workspace name. No client count, draft count, recent activity.
- **Verdict:** INCOMPLETE
- **Fix:** Even a minimal dashboard with "X clients · Y drafts in review · Z published this week" is launch-grade.

### D18 — Clients list page is a stub

- **Code state:** `apps/web/app/(app)/clients/page.tsx` — placeholder "No clients yet. Phase 1 will add client creation UI."
- **Verdict:** INCOMPLETE — Phase 1 reportedly complete (root CLAUDE.md says "Phase 2 complete; Phase 3 next") yet this remains
- **Fix:** Build the list/CRUD UI. The wizard creates the first; no way to add subsequent clients from the UI.

### D19 — No `/clients/[id]` index page

- **Code state:** No `apps/web/app/(app)/clients/[clientId]/page.tsx` — direct navigation 404s; only subroutes (brand-voice, calendar, drafts, generate, instagram, knowledge, repurpose) exist.
- **Verdict:** UNDOCUMENTED gap
- **Fix:** Add a client overview page (info, recent drafts, quick links).

### D20 — Knowledge base has no in-app upload

- **Spec says:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md` (Phase 2 section) — "File upload (PDF, MP3, MP4)"
- **Code state:** Backend exists (`/api/v1/clients/[id]/knowledge-bases/[id]/upload-url`, `/documents`). UI at `/clients/[id]/knowledge` shows "Use the API" message. No file picker.
- **Verdict:** PARTIAL — backend complete, UX not
- **Fix:** Add drag-drop / file picker; consume the presigned-URL endpoint.

### D21 — Captions route doesn't write generation_audit

- **Spec says:** `docs/superpowers/specs/2026-05-20-smm-therapy-platform-design.md:72`
  > "Audit log: `generation_audit` table … Immutable. SMM can export this if questioned by a licensing board."
- **Code state:** Hooks route writes audit row; captions route does not.
- **Verdict:** INCOMPLETE — compliance audit trail has captions-shaped hole
- **Fix:** Add audit row write to captions route, mirroring hooks.

### D22 — `complianceApproved: true` hardcoded on manual draft save

- **Spec says:** Compliance critic gates every generation before SMM sees content.
- **Code state:** `POST /api/v1/clients/[id]/drafts` route hardcodes `complianceApproved: true` for drafts the SMM manually saves. Bypasses real critic.
- **Verdict:** PARTIAL — bypasses Phase 1 acceptance criterion
- **Fix:** Run critic on manual saves (or document that manual saves are explicitly outside the critic's scope and surface that in UI).

### D23 — IG metrics sync silently swallows errors

- **Code state:** `packages/inngest/src/functions/ig-metrics-sync.ts:73` — bare `catch {}` on per-draft metric fetch. Expired tokens, throttled APIs, deleted media all silently no-op. No log, no alert.
- **Verdict:** UNDOCUMENTED defensive pattern (not in spec)
- **Fix:** At minimum log the failure with `step.run` so Inngest dashboard surfaces it. Consider Sentry capture.

### D24 — `trend-sync` undeclared retries default to 4 (LLM cost)

- **Code state:** `packages/inngest/src/functions/trend-sync.ts` — no `retries:` declaration. Inngest defaults to 4. The `synthesize` step calls Claude — failure burns up to 4× cost.
- **Verdict:** UNDOCUMENTED quirk
- **Fix:** Add `retries: 1`.

## LOW (cosmetic, hygiene, minor risks)

### D25 — Sidebar missing Billing link

- **Code state:** `apps/web/components/app-sidebar.tsx` has Dashboard, Clients, Trends. `/settings/billing` is only reachable by URL.
- **Verdict:** UNDOCUMENTED — Phase 7 plan delivers the page but not the link
- **Fix:** Add Settings → Billing entry.

### D26 — Onboarding wizard re-runs on re-entry

- **Code state:** `apps/web/app/(onboarding)/setup/page.tsx` doesn't check whether user already completed setup. Visiting `/setup` again can update workspace name + create a second "first client".
- **Fix:** Redirect to `/dashboard` if workspace already has any client.

### D27 — `vitest.config.ts` missing aliases for `@smm/features` and `@smm/inngest`

- **Rule says:** `.claude/rules/vitest-aliases.md` — every workspace package needs an alias
- **Code state:** No tests currently import these packages, so it doesn't fire. Future test additions will fail to resolve.
- **Fix:** Add the two aliases.

### D28 — Workspace export doesn't filter soft-deleted rows

- **Code state:** `/api/v1/workspace/export` returns all rows including those with `deletedAt`.
- **Spec says:** Section 3.7 — soft-delete table semantics. Export should reflect live state.
- **Fix:** Add `isNull(table.deletedAt)` to every export query, or document that export includes tombstones.

### D29 — Clerk webhook doesn't handle `organization.deleted`

- **Code state:** `apps/web/app/api/webhooks/clerk/route.ts` handles `created` + `updated`. No deleted handler → orphan workspace rows when an org is deleted in Clerk.
- **Fix:** Add `organization.deleted` → soft-delete the workspace.

### D30 — `scripts/setup/index.ts` Resend domain step has no `--ci` flag

- **Code state:** Domain name is only set via interactive prompt; `--ci` mode skips Resend domain setup with no exposed flag for the name.
- **Fix:** Add `--resend-domain <name>` flag.

### D31 — `packages/storage` has no startup validation for 4 R2 env vars

- **Code state:** Uses non-null assertions; failures emerge at HTTP layer rather than boot.
- **Fix:** Add an init guard that throws with a clear message at module load.

### D32 — `packages/inngest/src/functions/monthly-reports.tsx` JSX errors under root `tsc`

- **Code state:** Per project CLAUDE.md line 68, pre-existing noise. Explorer confirmed: only surfaces under root-level `tsc --noEmit`; package-level build (which Inngest uses) works correctly.
- **Verdict:** Not a runtime blocker, but breaks any strict CI typecheck targeting root.
- **Fix:** Move `"jsx": "react-jsx"` to the package's top-level compilerOptions instead of an override block.

## Doc-to-doc conflicts (DOC_CONFLICT)

### DC1 — Spec section 5 vs runbook section 6 on RLS

- Spec says explicit `workspace_id` query conditions (resolved); runbook still uses spec's pre-resolution language in places.
- Resolution: Update `packages/db/RLS.md` is canonical (which it is). Runbook doesn't conflict, but spec section 5 has both the old and resolved pattern bracketed; keep only the resolved version.

### DC2 — Spec promises Twilio SMS in Phase 4; root CLAUDE.md doesn't list Twilio

- Spec line 4 lists Twilio in stack; root `CLAUDE.md:7` does not. Code: `packages/notifications/src/sms.ts` exists but silently no-ops without Twilio env vars.
- Resolution: Decide if SMS ships in v1. If not, archive the SMS stub or document it as post-launch.

## Archive candidates

None at this time — all docs were authored within the last 30 days (2026-05-20 to 2026-05-27) and remain CURRENT. The Phase 0-7 plans should be kept until the corresponding code paths ship and stabilize. After launch, individual phase plans (especially Phase 0, 1) become historical and could move to `docs/archive/` with a frontmatter note.
