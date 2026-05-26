<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Local conventions in apps/web

- Path alias `@/*` resolves from `apps/web/` (configured in `apps/web/tsconfig.json`). Use `@/lib/...`, `@/components/...`.
- Route group conventions in use: `(app)` authenticated app surface, `(marketing)` public landing, `(onboarding)` setup flow, `portal/` magic-link client portal (public per middleware).
- Auth is enforced by `apps/web/middleware.ts` (Clerk). Public routes whitelisted there: `/`, `/sign-in`, `/sign-up`, `/portal`, `/api/portal`, `/api/webhooks`. Add a route to the matcher when adding new public surfaces — never add inline auth bypasses.
- Server actions and API routes call `requireWorkspace()` from `@/lib/workspace` to derive the workspaceId from the Clerk session. Do not parse workspaceId from request payloads.
- Rate limiting via `checkRateLimit(key, max, windowMs)` from `@/lib/rate-limit` (Postgres-backed). Apply to LLM/network-heavy routes.
- shadcn primitives live in `apps/web/components/ui/`. New components must use `cn()` from `@/lib/utils`.
- Sentry is wired with three configs at the app root (`sentry.client.config.ts`, `sentry.edge.config.ts`, `sentry.server.config.ts`). Do not add another initialiser.
- Project root `CLAUDE.md` covers monorepo-wide conventions and per-package rules.
