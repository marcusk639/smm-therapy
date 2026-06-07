# smm-therapy

Multi-tenant SaaS automating Instagram content creation and client-handoff for SMMs serving licensed mental health practitioners. Pre-launch. Phase 2 (RAG knowledge layer) is complete; Phase 3 (agent workflows) is next.

## Stack

Next.js 15 · Clerk · Neon Postgres + pgvector · Drizzle ORM · Inngest · Vercel · Cloudflare R2 · Anthropic (Claude Haiku 4.5 + Opus) · Voyage AI (`voyage-3` embeddings + `voyage-rerank-2`) · Stripe · Resend (email) · Twilio (SMS) · Unstructured (PDF parsing, Railway-hosted) · Groq (Whisper transcription).

## Repository layout

pnpm + Turborepo monorepo. Workspaces: `apps/*`, `packages/*`, `tools/*`.

- `apps/web` — Next.js 15 app (only app). Pages, API routes, middleware, Sentry config.
- `packages/ai` — Anthropic + Voyage clients, prompt builders, embeddings.
- `packages/compliance` — Per-state/credential rules, critic, crisis detection, disclaimers.
- `packages/crypto` — AES-256-GCM encrypt/decrypt primitives.
- `packages/db` — Drizzle schema, client, RLS helpers, migrations. See `packages/db/CLAUDE.md`.
- `packages/eval` — RAG eval harness (recall@k, MRR) and placeholder eval set.
- `packages/features` — Feature flag helpers.
- `packages/ingestion` — Source fetchers + chunkers + Inngest-driven pipeline. See `packages/ingestion/CLAUDE.md`.
- `packages/inngest` — Inngest client + function definitions.
- `packages/notifications` — Transactional email (Resend) + SMS (Twilio) senders.
- `packages/rag` — `retrieve()` pipeline (embed → hybrid search → rerank → citations).
- `packages/storage` — Cloudflare R2 (S3-compatible) presigner.
- `packages/types` — Zod schemas shared across the app.
- `tools/scraper-cli` — Standalone CLI for scraping niche content.
- `docs/superpowers/specs/` — Locked product spec (`2026-05-20-smm-therapy-platform-design.md`).
- `docs/superpowers/plans/` — Phase 0–7 implementation plans.

## Build, test, dev commands

| Command                 | Purpose                                                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm install`          | Install all workspace deps (pnpm 9).                                                                  |
| `pnpm dev`              | `turbo dev` across workspaces.                                                                        |
| `pnpm build`            | `turbo build`.                                                                                        |
| `pnpm lint`             | `turbo lint`.                                                                                         |
| `pnpm test`             | `turbo test`.                                                                                         |
| `pnpm test:unit`        | Vitest unit suite via `vitest.config.ts`.                                                             |
| `pnpm test:integration` | Vitest integration suite (needs `DATABASE_URL` + API keys).                                           |
| `pnpm db:seed`          | Seed compliance rules.                                                                                |
| `pnpm eval`             | Run RAG recall@5 eval; exits 1 if below 0.75 threshold. Needs `EVAL_CLIENT_ID` + `EVAL_WORKSPACE_ID`. |
| `pnpm setup`            | Interactive setup CLI (`scripts/setup/index.ts`).                                                     |

DB migrations: `cd packages/db && DATABASE_URL=... pnpm exec drizzle-kit generate` then apply via Neon console or migration runner.

## Top-level conventions

- **Imports** use `@smm/<package>[/<subpath>]`. Subpath exports are declared in each package's `package.json` `exports` map.
- **Authentication** is Clerk. `apps/web/middleware.ts` enforces auth on all non-public routes; public routes whitelisted there.
- **Tenant scoping** is explicit on every query, not a Postgres session var. Always filter by `workspaceId`. See `.claude/rules/workspace-scoping.md`.
- **Soft delete** via `deletedAt timestamp` columns; query callers add `isNull(table.deletedAt)`.
- **Inngest events** use `domain/action` slash-namespaced names: `ingestion/document.ingest`, `instagram/publish`, `calendar/generate`, `test/smoke`.
- **OAuth tokens** (Instagram, Google Drive) are AES-256-GCM encrypted at rest with per-provider env keys. See `.claude/rules/token-encryption.md`.
- **RAG calls in generation routes** must wrap `retrieve()` in a fail-safe catch. See `.claude/rules/rag-failsafe.md`.
- **Generation routes** follow `rate-limit → retrieve → Claude → compliance critic → audit row → llmUsageLog row` order.
- **Vitest aliases** are hand-maintained in `vitest.config.ts`. Adding a new workspace package requires an alias entry. See `.claude/rules/vitest-aliases.md`.

## File and naming conventions

- TypeScript strict mode; ES2022; ESNext modules; Bundler resolution.
- New tables ship with a `workspace_id uuid` FK and (where per-client) a `client_id uuid` FK.
- React components in `apps/web/components/ui/` follow the shadcn convention.
- Format on save runs Prettier (PostToolUse hook in the global `~/.claude/settings.json`).

## What is intentionally NOT here

- Multi-step procedures (build a feature, debug X) — those belong in skills.
- Pre-existing typecheck noise in `packages/inngest/src/functions/monthly-reports.tsx`, `calendar-generate.ts`, `trend-sync.ts` is a separate cleanup, not a project-wide concern.
- Phase 3+ design — see `docs/superpowers/plans/2026-05-20-phase-3-agent-workflows.md` and onward.
