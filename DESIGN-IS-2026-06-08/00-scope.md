# 00 — Scope Lock

**Audit:** Dieter Rams ten-principles design audit of the smm-therapy SMM-operator surface.
**Date:** 2026-06-08
**Auditor mode:** Static source-inferred (no running instance). All visual/perf/a11y findings are tagged **INFERRED** — derived from source (components, tokens, CSS), not from rendered pixels or measured runtime.

## Why source-inferred (constraint)

- No dev server running on ports 3000–3002.
- No `.env` files present (`apps/web/.env*`, root `.env*` absent) → app cannot be booted without env (Clerk, Neon, R2 init would fail).
- SMM-operator screens are auth-gated: `apps/web/middleware.ts` whitelists only `/`, `/sign-in(.*)`, `/sign-up(.*)`, `/portal(.*)`, `/api/portal(.*)`, `/api/webhooks(.*)`; all `(app)/*` routes hit `auth.protect()`.
- Honesty rule applies to the audit itself: rendered-only evidence (screenshots, computed styles, measured TTI, WCAG contrast) is reported as INFERRED or "could not inspect," never fabricated.

## Primary user & task

- **Primary user:** SMM operator (the agency user who logs in to manage their therapist clients and produce Instagram content).
- **Primary task:** Manage clients and create/route content — i.e. navigate clients → open a client → generate captions/hooks, manage drafts, calendar, knowledge, and hand off for review.

## Surface under audit (files)

Navigation / shell:

- `apps/web/app/(app)/layout.tsx`
- `apps/web/components/app-sidebar.tsx`

Primary task screens:

- `apps/web/app/(app)/dashboard/page.tsx`
- `apps/web/app/(app)/clients/page.tsx` (clients list)
- `apps/web/app/(app)/clients/[clientId]/generate/captions/page.tsx`
- `apps/web/app/(app)/clients/[clientId]/generate/hooks/page.tsx`
- `apps/web/app/(app)/clients/[clientId]/calendar/page.tsx`
- `apps/web/app/(app)/clients/[clientId]/drafts/[draftId]/page.tsx`
- `apps/web/app/(app)/clients/[clientId]/repurpose/page.tsx`
- `apps/web/app/(app)/clients/[clientId]/knowledge/page.tsx`
- `apps/web/app/(app)/clients/[clientId]/brand-voice/page.tsx`
- `apps/web/app/(app)/clients/[clientId]/instagram/page.tsx`
- `apps/web/app/(app)/trends/page.tsx`
- `apps/web/app/(app)/settings/billing/page.tsx`

Design system:

- `apps/web/components/ui/*` (alert, avatar, badge, button, card, checkbox, input, label, separator, skeleton, textarea)
- `apps/web/components/compliance-badge.tsx`
- `apps/web/app/globals.css` (Tailwind v4 token source; no `tailwind.config`)

## Constraints

- Stack: Next.js 15 App Router, shadcn/ui conventions, Tailwind v4, Clerk.
- Pre-launch; Phase 2 complete, Phase 3 (agent workflows) next.
- Brand: not yet formalized — token palette in `globals.css` is the de facto brand.

## Open structural questions (for subagents to confirm)

- Is there a `clients/[clientId]/page.tsx` (client root landing)? Initial inventory suggests **no**.
- Is there a `clients/[clientId]/drafts/page.tsx` (drafts list)? Initial inventory suggests **no** (only `drafts/[draftId]`).

## Out of scope

- Client-portal surface (`/portal/*`) — different user (the therapist), not the SMM operator.
- Marketing/landing (`/(marketing)`), auth screens, onboarding (`/(onboarding)/setup`).
- API routes, Inngest functions, backend packages.
