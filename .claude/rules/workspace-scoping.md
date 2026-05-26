---
paths:
  - "apps/web/app/api/**/route.ts"
  - "packages/db/src/**/*.ts"
  - "packages/inngest/src/functions/**/*.ts"
---

# Tenant scoping is explicit on every query

Neon's PgBouncer runs in transaction mode by default. `SET LOCAL app.workspace_id` does not survive across pooled connections, so Postgres-level RLS via session vars is not used. Tenant scoping is enforced in application code on every query.

## Required pattern

In API routes:

```ts
import { requireWorkspace } from "@/lib/workspace";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";

const auth = await requireWorkspace();
if (auth instanceof NextResponse) return auth;
const { workspaceId } = auth;

const [row] = await db
  .select()
  .from(clients)
  .where(
    and(
      workspaceFilter(clients.workspaceId, workspaceId),
      eq(clients.id, clientId),
      isNull(clients.deletedAt),
    ),
  );
```

In Inngest functions, derive `workspaceId` from the event payload or by joining through the resource being processed (e.g. document → knowledge base → workspace).

## Rules

- Every new query that touches a per-tenant table must include `workspaceFilter(table.workspaceId, workspaceId)` in its WHERE clause.
- Soft-deleted rows must be excluded with `isNull(table.deletedAt)` unless the route explicitly handles deleted rows.
- Never accept `workspaceId` from request bodies or path params — always read it from `requireWorkspace()` (which derives from Clerk session).
- The cross-client isolation test at `tests/integration/rag/isolation.test.ts` is the canonical regression check for this rule on RAG retrieval.

## Why this matters

A missing `workspaceFilter()` is a cross-tenant data leak. The check is mechanical but absolutely required.
