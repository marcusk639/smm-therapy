# CONTINUE — Resume the SMM-operator design redesign from a new session

This doc lets a fresh Claude Code session pick up where the 2026-06-08 Dieter Rams audit left off, with zero prior context. Read it top to bottom, then jump to **What to do next**.

## TL;DR

- A design audit of the **SMM-operator surface** (`apps/web/app/(app)/*`) ran on 2026-06-08.
- **Verdict: REDESIGN — 14/30.** Load-bearing principle #2 (Useful) scored **0**: an operator cannot manage clients through the UI.
- The audit was **source-inferred** (no env, no running server, screens are auth-gated) — visual/perf/a11y findings are tagged INFERRED and need a rendered re-check.
- The next action is to run `/make-plan` with the prepared handoff, OR stand up a running instance to confirm the INFERRED findings first.

## Where everything is

All artifacts live in `DESIGN-IS-2026-06-08/` at the repo root:

| File                   | What it holds                                                   |
| ---------------------- | --------------------------------------------------------------- |
| `00-scope.md`          | What was audited + why source-inferred                          |
| `01-evidence.md`       | Consolidated, `file:line`-cited facts from 5 evidence subagents |
| `02-scorecard.md`      | Per-principle 0–3 scores with anchors (total 14/30)             |
| `03-verdict.md`        | REDESIGN reasoning + top 5 highest-leverage moves               |
| `04-handoff-prompt.md` | **Ready-to-paste `/make-plan` prompt** (self-contained)         |
| `CONTINUE.md`          | This file                                                       |

## What the audit found (so you don't re-derive it)

Scores: #1 Innovative 2 · **#2 Useful 0** · #3 Aesthetic 1 · #4 Understandable 1 · #5 Unobtrusive 2 · #6 Honest 2 · #7 Long-lasting 2 · #8 Thorough 1 · #9 Env-friendly 2 · #10 As-little-design 1.

The five structural failures driving the verdict:

1. **No task entry point.** `apps/web/app/(app)/clients/page.tsx:5-7` is a static stub ("Phase 1 will add client creation UI."). `clients/[clientId]/page.tsx` and `clients/[clientId]/drafts/page.tsx` **do not exist** → both 404.
2. **Per-client tools are URL-only.** `apps/web/components/app-sidebar.tsx:9-14` lists only Dashboard/Clients/Trends/Billing. Calendar/drafts/knowledge/brand-voice/instagram/repurpose/generate have no nav and no inbound links.
3. **A crashing import.** `apps/web/app/(app)/clients/[clientId]/drafts/[draftId]/page.tsx:9-15` imports `@/components/ui/select`, which does not exist.
4. **Duplicated, off-token status colors** in 4 places (`calendar:19-27`, `knowledge:33-42`, `repurpose:32-35`, `drafts/[draftId]:130-131`), light-mode-only.
5. **Swallowed errors + inert dark mode** (`settings/billing/page.tsx:49,60,69`; `globals.css:27-47` dark tokens never activated).

**Preserve (do NOT discard):** the HSL token system (`apps/web/app/globals.css`), the shadcn primitives (`apps/web/components/ui/*`), the generate flows (`generate/{hooks,captions}/page.tsx`, `brand-voice/page.tsx`), and the compliance UX (crisis resources + violation lists + citations; `components/compliance-badge.tsx`).

## What to do next

Pick the path that matches your goal.

### Path A — Plan the redesign now (default)

1. Open `DESIGN-IS-2026-06-08/04-handoff-prompt.md`.
2. Copy the single fenced `/make-plan …` block (it quotes the verdict, Preserve/Discard lists, and the 5 moves — fully self-contained).
3. Paste it into the session to generate the implementation plan, then `/do` to execute.

### Path B — Verify the INFERRED findings against a rendered UI first

The audit could not render the screens. Confirm contrast, dark mode, and focus rings before building. To stand up the surface:

1. Restore environment: there is **no `.env`** in the repo. Run the interactive setup, then start the app:
   ```bash
   pnpm install
   pnpm setup        # scripts/setup/index.ts — populates required env (Clerk, Neon, R2, etc.)
   pnpm dev          # turbo dev; Next.js app is apps/web
   ```
2. The SMM-operator screens (`/dashboard`, `/clients`, `/clients/[clientId]/*`, `/trends`, `/settings/billing`) are **auth-gated** by `apps/web/middleware.ts` — sign in with a Clerk SMM-operator session to reach them.
3. Re-check, against the rendered DOM: `muted-foreground`-on-`background` contrast (audit computed ~4.4:1, borderline AA), dark-mode badge legibility, and the 1px focus-ring visibility / sidebar-nav focus gap.
4. Then proceed to Path A.

### Path C — Re-run the audit (if the code changed materially since 2026-06-08)

Re-invoke `/claude-mem:design-is` against the same surface and compare scorecards. Use the same scope from `00-scope.md`.

## Relevant project commands (from `package.json` / root `CLAUDE.md`)

| Command        | Purpose                                              |
| -------------- | ---------------------------------------------------- |
| `pnpm install` | Install all workspace deps (pnpm 9)                  |
| `pnpm setup`   | Interactive env setup (`scripts/setup/index.ts`)     |
| `pnpm dev`     | `turbo dev` across workspaces (runs the Next.js app) |
| `pnpm build`   | `turbo build`                                        |
| `pnpm lint`    | `turbo lint`                                         |
| `pnpm test`    | `turbo test`                                         |

## Guardrails for whoever continues

- **Honor the Preserve list.** The token system, primitives, generate flows, and compliance UX scored well — keep them intact; redesign the IA spine around them.
- **The IA must change, not just the CSS.** Restyling cannot fix "the task has no entry point."
- **Don't claim visual success from source alone.** If you change UI, verify in a browser (Path B) before declaring done.
- **#2 = 0 partly reflects unbuilt Phase 1** (client creation UI). The redesign is of the navigation/IA spine; do not rewrite the working per-client tools.
