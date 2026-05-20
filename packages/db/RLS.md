# RLS Pattern

## Why not SET LOCAL?

Neon's PgBouncer runs in **transaction mode**. `SET LOCAL app.workspace_id = ...`
is scoped to a transaction and does NOT survive across pooled connections.
Using session variables for RLS produces inconsistent isolation under load.

## The Pattern

Pass `workspace_id` explicitly in every Drizzle query:

```typescript
import { db } from "@smm/db/client";
import { clients } from "@smm/db/schema";
import { workspaceFilter, and, isNull } from "@smm/db/rls";

const result = await db
  .select()
  .from(clients)
  .where(
    and(
      workspaceFilter(clients.workspaceId, workspaceId),
      isNull(clients.deletedAt),
    ),
  );
```

## CI Enforcement

`tests/integration/rls.test.ts` verifies cross-workspace reads return empty.
This test runs on every PR via `pnpm test:integration`.
