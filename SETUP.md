# smm-therapy — New Machine Setup

SMM Therapy platform. pnpm monorepo with Turborepo — Next.js web app + AI/compliance/storage services.

## Prerequisites

| Tool           | Version | Install                                                    |
| -------------- | ------- | ---------------------------------------------------------- |
| Node.js        | ≥20     | `brew install node` or nvm                                 |
| pnpm           | ≥9      | `npm install -g pnpm`                                      |
| Docker Desktop | latest  | [docker.com](https://docker.com) (for local DB + services) |

## Clone & Install

```bash
git clone https://github.com/marcusk639/smm-therapy.git
cd smm-therapy

# Check out active branch (verify with git branch -a)
git checkout docs/design-audit-smm-operator

pnpm install
```

## Environment

```bash
# Copy and fill env files for each app/service that needs them
cp apps/web/.env.example apps/web/.env.local 2>/dev/null

# Run setup script (may generate .env files automatically)
pnpm setup
```

Key secrets to retrieve from 1Password (if vault exists) or relevant dashboards:

| Service      | Variable                                                | Source                          |
| ------------ | ------------------------------------------------------- | ------------------------------- |
| Clerk (auth) | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | clerk.com dashboard             |
| Database     | `DATABASE_URL`                                          | Local Docker or hosted Postgres |
| AI           | `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`                 | respective dashboards           |

## Start

```bash
# Start all apps and services in dev mode (via Turborepo)
pnpm dev

# Web app only
pnpm --filter apps/web dev    # localhost:3000
```

## Monorepo Structure

| Path                   | What it is                              |
| ---------------------- | --------------------------------------- |
| `apps/web/`            | Next.js frontend (Clerk auth, Radix UI) |
| `packages/ai/`         | AI provider integrations                |
| `packages/compliance/` | Compliance checks                       |
| `packages/db/`         | Database schema and queries             |
| `packages/rag/`        | RAG pipeline                            |
| `packages/storage/`    | File storage                            |
| `packages/types/`      | Shared TypeScript types                 |
| `services/`            | Background services                     |
| `packages/ingestion/`  | Document ingestion                      |
| `packages/inngest/`    | Inngest background jobs                 |

## Database

```bash
# Start local Postgres (if using Docker)
docker compose up -d

# Seed database
pnpm db:seed
```

## Test

```bash
pnpm test              # all tests via Turborepo
pnpm test:unit         # unit tests only
pnpm test:integration  # integration tests only
```

## Notes

- Active branch is `docs/design-audit-smm-operator`, not `main`
- Turbo caches builds — `pnpm build` is incremental
- Clerk is the auth provider — `@clerk/nextjs` is in the web app
