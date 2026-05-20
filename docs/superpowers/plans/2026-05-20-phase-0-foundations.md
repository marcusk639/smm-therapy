# Phase 0: Foundations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the monorepo, auth, database, and core infrastructure so Phase 1 generation work can start on Day 8.

**Architecture:** pnpm + Turborepo monorepo. Next.js 15 App Router. Clerk Orgs = SMM workspaces. Neon Postgres + pgvector with Drizzle ORM; multi-tenant isolation via explicit `workspace_id` query conditions (not `SET LOCAL` — Neon PgBouncer runs in transaction mode). Inngest serves as the durable workflow engine via a Next.js Route Handler.

**Tech Stack:** Next.js 15 · @clerk/nextjs · drizzle-orm · @neondatabase/serverless · inngest · @aws-sdk/client-s3 (R2) · shadcn/ui · @asteasolutions/zod-to-openapi · @sentry/nextjs · vitest · @playwright/test

---

## File Structure

```
/
├── apps/web/
│   ├── app/
│   │   ├── (app)/layout.tsx                  # Authenticated shell (sidebar)
│   │   ├── (app)/dashboard/page.tsx
│   │   ├── (app)/clients/page.tsx
│   │   ├── (app)/clients/new/page.tsx
│   │   ├── (marketing)/page.tsx              # Empty shell
│   │   ├── (portal)/layout.tsx               # Client portal shell
│   │   ├── api/v1/clients/route.ts
│   │   ├── api/v1/workspaces/route.ts
│   │   ├── api/inngest/route.ts
│   │   ├── api/webhooks/clerk/route.ts
│   │   ├── api/openapi.json/route.ts
│   │   └── layout.tsx                        # Root layout with ClerkProvider
│   ├── components/app-sidebar.tsx
│   ├── lib/workspace.ts                      # getWorkspaceId() helper
│   ├── middleware.ts
│   ├── next.config.ts
│   └── package.json
│
├── packages/
│   ├── db/
│   │   ├── src/
│   │   │   ├── schema/
│   │   │   │   ├── index.ts                  # Re-exports all schemas
│   │   │   │   ├── workspaces.ts
│   │   │   │   ├── clients.ts
│   │   │   │   ├── users.ts
│   │   │   │   └── compliance-rules.ts       # Schema only, no seed data
│   │   │   ├── client.ts                     # Drizzle + Neon instance
│   │   │   ├── rls.ts                        # workspaceFilter() helper
│   │   │   └── index.ts
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   │
│   ├── types/
│   │   ├── src/
│   │   │   ├── workspace.ts                  # Zod schemas with OpenAPI decorators
│   │   │   └── client.ts
│   │   └── package.json
│   │
│   ├── inngest/
│   │   ├── src/
│   │   │   ├── client.ts
│   │   │   └── functions/index.ts
│   │   └── package.json
│   │
│   ├── storage/
│   │   ├── src/r2.ts                         # Presigned upload/download URLs
│   │   └── package.json
│   │
│   └── compliance/
│       ├── src/
│       │   ├── schema.ts                     # ComplianceRule type
│       │   └── engine.ts                     # Empty getRulesForClient() skeleton
│       └── package.json
│
├── services/docker-compose.yml               # Unstructured API local dev
├── package.json                              # Root (pnpm workspaces)
├── pnpm-workspace.yaml
├── turbo.json
└── vitest.config.ts
```

---

### Task 1: Monorepo scaffold

**Files:**

- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "smm-therapy",
  "private": true,
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "test": "turbo test",
    "test:integration": "vitest run --config vitest.integration.config.ts"
  },
  "devDependencies": {
    "turbo": "latest",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "@vitest/coverage-v8": "^2.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
```

- [ ] **Step 2: Create pnpm-workspace.yaml**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 3: Create turbo.json**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "ui": "tui",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "inputs": ["$TURBO_DEFAULT$", ".env*"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    }
  }
}
```

- [ ] **Step 4: Create tsconfig.json (root, extended by packages)**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 5: Create .gitignore**

```
node_modules/
.next/
.turbo/
dist/
*.env.local
*.env
!*.env.example
.DS_Store
coverage/
```

- [ ] **Step 6: Create .env.example**

```bash
# Neon Postgres
DATABASE_URL=postgresql://user:pass@ep-xyz.neon.tech/neondb?sslmode=require

# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard

# Inngest
INNGEST_EVENT_KEY=...
INNGEST_SIGNING_KEY=...

# Cloudflare R2
CLOUDFLARE_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=smm-therapy

# Sentry
NEXT_PUBLIC_SENTRY_DSN=https://...@sentry.io/...
SENTRY_AUTH_TOKEN=...
SENTRY_ORG=...
SENTRY_PROJECT=smm-therapy-web

# Portal
PORTAL_SECRET=<32-byte random hex: openssl rand -hex 32>
```

- [ ] **Step 7: Install dependencies and verify**

```bash
pnpm install
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add .
git commit -m "chore: init monorepo with pnpm + Turborepo"
```

---

### Task 2: Next.js 15 app

**Files:**

- Create: `apps/web/` (via create-next-app)
- Modify: `apps/web/package.json` (add workspace package name)

- [ ] **Step 1: Scaffold the app**

```bash
pnpm create next-app@latest apps/web \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"
```

- [ ] **Step 2: Update apps/web/package.json — add workspace name**

Open `apps/web/package.json` and set `"name": "@smm/web"`. Also add:

```json
{
  "name": "@smm/web",
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "test": "vitest run",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 3: Create apps/web/next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@smm/db",
    "@smm/types",
    "@smm/inngest",
    "@smm/storage",
    "@smm/compliance",
  ],
};

export default nextConfig;
```

- [ ] **Step 4: Verify dev server starts**

```bash
cd apps/web && pnpm dev
```

Expected: Next.js dev server running on http://localhost:3000. Stop with Ctrl+C.

- [ ] **Step 5: Commit**

```bash
git add apps/web/
git commit -m "chore: add Next.js 15 app"
```

---

### Task 3: Tailwind + shadcn/ui

**Files:**

- Modify: `apps/web/tailwind.config.ts` (already created by create-next-app)
- Create: `apps/web/components/ui/` (via shadcn CLI)
- Create: `apps/web/lib/utils.ts` (via shadcn init)

- [ ] **Step 1: Run shadcn init**

```bash
cd apps/web
pnpm dlx shadcn@latest init
```

When prompted: choose Default style, slate base color, CSS variables = yes.

- [ ] **Step 2: Add the components needed for Phase 0 UI**

```bash
pnpm dlx shadcn@latest add button input label card badge separator
```

- [ ] **Step 3: Verify a component renders**

Create `apps/web/app/page.tsx` temporarily:

```tsx
import { Button } from "@/components/ui/button";

export default function Home() {
  return <Button>Hello</Button>;
}
```

Run `pnpm dev`, open http://localhost:3000, confirm button renders. Revert the file after:

```tsx
export default function Home() {
  return <div>SMM Therapy</div>;
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/
git commit -m "chore: add shadcn/ui"
```

---

### Task 4: packages/db — Neon + Drizzle

**Files:**

- Create: `packages/db/package.json`
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/tsconfig.json`

- [ ] **Step 1: Create packages/db/package.json**

```json
{
  "name": "@smm/db",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema/index.ts",
    "./client": "./src/client.ts",
    "./rls": "./src/rls.ts"
  },
  "scripts": {
    "generate": "drizzle-kit generate",
    "migrate": "drizzle-kit migrate",
    "studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@neondatabase/serverless": "^0.10.0",
    "drizzle-orm": "^0.38.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "drizzle-kit": "^0.29.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create packages/db/tsconfig.json**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create packages/db/src/client.ts**

```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema/index";

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });

export type DB = typeof db;
```

- [ ] **Step 4: Create packages/db/drizzle.config.ts**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 5: Create packages/db/src/index.ts**

```typescript
export { db } from "./client";
export * from "./schema/index";
export * from "./rls";
```

- [ ] **Step 6: Install db package deps**

```bash
pnpm install
```

- [ ] **Step 7: Commit**

```bash
git add packages/db/
git commit -m "chore: add @smm/db package with Drizzle + Neon"
```

---

### Task 5: Core schema — workspaces, users, clients

**Files:**

- Create: `packages/db/src/schema/workspaces.ts`
- Create: `packages/db/src/schema/users.ts`
- Create: `packages/db/src/schema/clients.ts`
- Create: `packages/db/src/schema/compliance-rules.ts`
- Create: `packages/db/src/schema/index.ts`
- Create: `packages/db/src/rls.ts`

- [ ] **Step 1: Create packages/db/src/schema/workspaces.ts**

```typescript
import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["starter", "growth", "agency"]);

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkOrgId: text("clerk_org_id").notNull().unique(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: planEnum("plan").notNull().default("starter"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
```

- [ ] **Step 2: Create packages/db/src/schema/users.ts**

```typescript
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  clerkUserId: text("clerk_user_id").notNull().unique(),
  email: text("email").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const workspaceMembers = pgTable("workspace_members", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  clerkUserId: text("clerk_user_id").notNull(),
  role: text("role", { enum: ["owner", "member"] })
    .notNull()
    .default("member"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
```

- [ ] **Step 3: Create packages/db/src/schema/clients.ts**

```typescript
import { pgTable, uuid, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  practiceState: text("practice_state"),
  primaryCredential: text("primary_credential", {
    enum: ["LCSW", "LMFT", "LPC", "PsyD", "PhD", "MD", "Other"],
  }),
  instagramHandle: text("instagram_handle"),
  metadata: jsonb("metadata").default("{}"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;
```

- [ ] **Step 4: Create packages/db/src/schema/compliance-rules.ts**

```typescript
import {
  pgTable,
  pgEnum,
  uuid,
  text,
  jsonb,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const ruleTypeEnum = pgEnum("rule_type", [
  "prohibition",
  "requirement",
  "warning",
]);

export const complianceRules = pgTable("compliance_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  ruleText: text("rule_text").notNull(),
  ruleType: ruleTypeEnum("rule_type").notNull(),
  credentialTypes: jsonb("credential_types")
    .notNull()
    .default(sql`'[]'::jsonb`),
  states: jsonb("states")
    .notNull()
    .default(sql`'[]'::jsonb`),
  sourceCitation: text("source_citation").notNull(),
  effectiveDate: timestamp("effective_date", { withTimezone: true }),
  version: text("version").notNull().default("1.0"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const crisisResources = pgTable("crisis_resources", {
  id: uuid("id").defaultRandom().primaryKey(),
  topicKey: text("topic_key").notNull().unique(),
  resourceText: text("resource_text").notNull(),
  hotline: text("hotline"),
  url: text("url"),
  active: boolean("active").notNull().default(true),
});

export type ComplianceRule = typeof complianceRules.$inferSelect;
export type CrisisResource = typeof crisisResources.$inferSelect;
```

- [ ] **Step 5: Create packages/db/src/schema/index.ts**

```typescript
export * from "./workspaces";
export * from "./users";
export * from "./clients";
export * from "./compliance-rules";
```

- [ ] **Step 6: Create packages/db/src/rls.ts**

```typescript
import { eq, and, isNull } from "drizzle-orm";
import type { Column } from "drizzle-orm";

/**
 * Neon's PgBouncer runs in transaction mode: SET LOCAL session variables
 * do NOT persist across pooled connections. Never use SET LOCAL for
 * workspace isolation. Always filter by workspace_id explicitly in every
 * query. This helper makes the pattern consistent.
 *
 * Usage:
 *   .where(and(workspaceFilter(clients.workspaceId, workspaceId), isNull(clients.deletedAt)))
 */
export function workspaceFilter(col: Column, workspaceId: string) {
  return eq(col, workspaceId);
}

export { and, isNull, eq };
```

- [ ] **Step 7: Create packages/db/RLS.md**

````markdown
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
````

## CI Enforcement

`tests/integration/rls.test.ts` verifies cross-workspace reads return empty.
This test runs on every PR via `pnpm test:integration`.

````

- [ ] **Step 8: Generate and run initial migration**

Copy `.env.example` to `.env.local` and fill in `DATABASE_URL` with your Neon connection string.

```bash
cd packages/db
DATABASE_URL=<your-neon-url> pnpm generate
DATABASE_URL=<your-neon-url> pnpm migrate
````

Expected: migration files created in `packages/db/migrations/`, migration applied to Neon.

- [ ] **Step 9: Commit**

```bash
git add packages/db/
git commit -m "feat: core DB schema (workspaces, users, clients, compliance-rules)"
```

---

### Task 6: RLS isolation integration test

**Files:**

- Create: `vitest.integration.config.ts`
- Create: `tests/integration/rls.test.ts`

- [ ] **Step 1: Create vitest.integration.config.ts (root)**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globals: true,
    testTimeout: 30_000,
  },
});
```

- [ ] **Step 2: Write the failing test first**

Create `tests/integration/rls.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../../packages/db/src/schema/index";
import { eq, and, isNull } from "drizzle-orm";
import { workspaceFilter } from "../../packages/db/src/rls";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const SUFFIX = Math.random().toString(36).slice(2, 8);

describe("workspace isolation (RLS pattern)", () => {
  let wsAId: string;
  let wsBId: string;
  let clientId: string;

  beforeAll(async () => {
    const [wsA] = await db
      .insert(schema.workspaces)
      .values({
        clerkOrgId: `test_org_A_${SUFFIX}`,
        name: "WS A",
        slug: `ws-a-${SUFFIX}`,
      })
      .returning();
    const [wsB] = await db
      .insert(schema.workspaces)
      .values({
        clerkOrgId: `test_org_B_${SUFFIX}`,
        name: "WS B",
        slug: `ws-b-${SUFFIX}`,
      })
      .returning();
    wsAId = wsA.id;
    wsBId = wsB.id;

    const [client] = await db
      .insert(schema.clients)
      .values({
        workspaceId: wsAId,
        name: "Therapy Co",
        slug: `therapy-co-${SUFFIX}`,
      })
      .returning();
    clientId = client.id;
  });

  afterAll(async () => {
    await db
      .delete(schema.clients)
      .where(eq(schema.clients.workspaceId, wsAId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, wsAId));
    await db.delete(schema.workspaces).where(eq(schema.workspaces.id, wsBId));
  });

  it("querying with workspace-B id returns zero clients from workspace-A", async () => {
    const result = await db
      .select()
      .from(schema.clients)
      .where(
        and(
          workspaceFilter(schema.clients.workspaceId, wsBId),
          isNull(schema.clients.deletedAt),
        ),
      );

    expect(result).toHaveLength(0);
    expect(result.find((c) => c.id === clientId)).toBeUndefined();
  });

  it("querying with workspace-A id returns workspace-A clients", async () => {
    const result = await db
      .select()
      .from(schema.clients)
      .where(
        and(
          workspaceFilter(schema.clients.workspaceId, wsAId),
          isNull(schema.clients.deletedAt),
        ),
      );

    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.find((c) => c.id === clientId)).toBeDefined();
  });
});
```

- [ ] **Step 3: Run the test (should pass — verifying correct behavior)**

```bash
DATABASE_URL=<your-neon-url> pnpm test:integration
```

Expected: both tests PASS. If they fail, your schema migration didn't run — re-run `pnpm migrate`.

- [ ] **Step 4: Add test script to root package.json**

In `package.json`, `test:integration` script already points to vitest integration config. Add to CI later.

- [ ] **Step 5: Commit**

```bash
git add vitest.integration.config.ts tests/
git commit -m "test: add RLS isolation integration test"
```

---

### Task 7: Clerk auth + middleware

**Files:**

- Create: `apps/web/middleware.ts`
- Modify: `apps/web/app/layout.tsx`
- Create: `apps/web/lib/workspace.ts`
- Modify: `apps/web/package.json`

- [ ] **Step 1: Add Clerk to apps/web**

```bash
cd apps/web
pnpm add @clerk/nextjs
```

- [ ] **Step 2: Create apps/web/middleware.ts**

```typescript
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/portal(.*)",
  "/api/webhooks(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 3: Update apps/web/app/layout.tsx**

```tsx
import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";

export const metadata: Metadata = {
  title: "SMM Therapy",
  description: "Social media automation for mental health practices",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

- [ ] **Step 4: Create apps/web/app/sign-in/[[...sign-in]]/page.tsx**

```tsx
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 5: Create apps/web/app/sign-up/[[...sign-up]]/page.tsx**

```tsx
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 6: Create apps/web/lib/workspace.ts**

This helper extracts `workspaceId` (the Neon UUID) from the Clerk `orgId` in API routes.

```typescript
import { auth } from "@clerk/nextjs/server";
import { db } from "@smm/db/client";
import { workspaces } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Call this at the top of every authenticated API route.
 * Returns the workspace UUID (Neon) for the current Clerk org.
 * Returns a 401/400 NextResponse if auth fails.
 */
export async function requireWorkspace(): Promise<
  { workspaceId: string; userId: string } | NextResponse
> {
  const { userId, orgId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json(
      { error: "No workspace selected. Create or join an organization." },
      { status: 400 },
    );
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.clerkOrgId, orgId));

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return { workspaceId: workspace.id, userId };
}
```

- [ ] **Step 7: Set Clerk env vars in .env.local, verify sign-in works**

Copy `.env.example` to `apps/web/.env.local`. Fill in:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — from Clerk dashboard
- `CLERK_SECRET_KEY` — from Clerk dashboard

Run `pnpm dev`, navigate to http://localhost:3000/sign-in. Confirm Clerk UI renders.

- [ ] **Step 8: Commit**

```bash
git add apps/web/
git commit -m "feat: add Clerk auth + middleware + requireWorkspace() helper"
```

---

### Task 8: Clerk Org → workspace webhook

**Files:**

- Create: `apps/web/app/api/webhooks/clerk/route.ts`

- [ ] **Step 1: Add svix dependency**

```bash
cd apps/web
pnpm add svix
```

- [ ] **Step 2: Create apps/web/app/api/webhooks/clerk/route.ts**

```typescript
import { Webhook } from "svix";
import { headers } from "next/headers";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { db } from "@smm/db/client";
import { workspaces } from "@smm/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;
  if (!WEBHOOK_SECRET) {
    return new Response("Missing CLERK_WEBHOOK_SECRET", { status: 500 });
  }

  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const body = await req.text();
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;
  try {
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as WebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (evt.type === "organization.created") {
    const { id, name, slug } = evt.data;
    await db
      .insert(workspaces)
      .values({
        clerkOrgId: id,
        name,
        slug: slug ?? id,
      })
      .onConflictDoNothing({ target: workspaces.clerkOrgId });
  }

  if (evt.type === "organization.updated") {
    const { id, name, slug } = evt.data;
    await db
      .update(workspaces)
      .set({ name, slug: slug ?? id })
      .where(eq(workspaces.clerkOrgId, id));
  }

  return new Response("OK", { status: 200 });
}
```

- [ ] **Step 3: Register the webhook in Clerk dashboard**

1. Go to Clerk Dashboard → Webhooks → Add Endpoint
2. URL: `https://<your-ngrok-or-vercel-preview>/api/webhooks/clerk`
3. Events: `organization.created`, `organization.updated`
4. Copy the signing secret → set as `CLERK_WEBHOOK_SECRET` in `.env.local`

For local testing, use ngrok: `ngrok http 3000`.

- [ ] **Step 4: Test the webhook**

In Clerk Dashboard, use "Send Test Webhook" for `organization.created`. Then verify in Neon:

```bash
# In packages/db, run a quick check
DATABASE_URL=<url> npx drizzle-kit studio
```

Or query directly:

```sql
SELECT * FROM workspaces ORDER BY created_at DESC LIMIT 5;
```

Expected: one row with the test org data.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/webhooks/
git commit -m "feat: Clerk org.created webhook creates workspace row"
```

---

### Task 9: Client CRUD API

**Files:**

- Create: `apps/web/app/api/v1/clients/route.ts`
- Create: `apps/web/app/api/v1/clients/[clientId]/route.ts`
- Create: `tests/unit/api/clients.test.ts`

- [ ] **Step 1: Write the unit test first**

Create `tests/unit/api/clients.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { z } from "zod";

const CreateClientSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/),
  practiceState: z.string().length(2).optional(),
  primaryCredential: z
    .enum(["LCSW", "LMFT", "LPC", "PsyD", "PhD", "MD", "Other"])
    .optional(),
  instagramHandle: z.string().optional(),
});

describe("CreateClientSchema", () => {
  it("accepts valid client data", () => {
    const result = CreateClientSchema.safeParse({
      name: "Therapy & Co",
      slug: "therapy-co",
      practiceState: "CA",
      primaryCredential: "LCSW",
    });
    expect(result.success).toBe(true);
  });

  it("rejects slug with spaces", () => {
    const result = CreateClientSchema.safeParse({
      name: "Therapy Co",
      slug: "therapy co",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty name", () => {
    const result = CreateClientSchema.safeParse({
      name: "",
      slug: "valid-slug",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test — should fail (schema not defined yet)**

Add vitest to `apps/web`:

```bash
cd apps/web && pnpm add -D vitest
```

Add to `apps/web/package.json` scripts: `"test": "vitest run"`

```bash
cd apps/web && pnpm test
```

Expected: FAIL — `CreateClientSchema` not imported from production code yet.

- [ ] **Step 3: Create packages/types/src/client.ts**

```bash
mkdir -p packages/types/src
```

Create `packages/types/package.json`:

```json
{
  "name": "@smm/types",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./workspace": "./src/workspace.ts"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

Create `packages/types/src/client.ts`:

```typescript
import { z } from "zod";

export const CreateClientSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-z0-9-]+$/, "slug must be lowercase alphanumeric with hyphens"),
  practiceState: z.string().length(2).toUpperCase().optional(),
  primaryCredential: z
    .enum(["LCSW", "LMFT", "LPC", "PsyD", "PhD", "MD", "Other"])
    .optional(),
  instagramHandle: z.string().optional(),
});

export const UpdateClientSchema = CreateClientSchema.partial();

export type CreateClientInput = z.infer<typeof CreateClientSchema>;
export type UpdateClientInput = z.infer<typeof UpdateClientSchema>;
```

Update the test to import from `@smm/types/client`:

```typescript
import { CreateClientSchema } from "@smm/types/client";
```

- [ ] **Step 4: Run the test — should pass now**

```bash
cd apps/web && pnpm test
```

Expected: 3 tests PASS.

- [ ] **Step 5: Create apps/web/app/api/v1/clients/route.ts**

```typescript
import { NextResponse } from "next/server";
import { db } from "@smm/db/client";
import { clients } from "@smm/db/schema";
import { workspaceFilter, and, isNull } from "@smm/db/rls";
import { CreateClientSchema } from "@smm/types/client";
import { requireWorkspace } from "@/lib/workspace";

export async function GET(req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const rows = await db
    .select()
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        isNull(clients.deletedAt),
      ),
    )
    .orderBy(clients.createdAt);

  return NextResponse.json({ clients: rows });
}

export async function POST(req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const body = await req.json();
  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const [client] = await db
    .insert(clients)
    .values({ workspaceId, ...parsed.data })
    .returning();

  return NextResponse.json({ client }, { status: 201 });
}
```

- [ ] **Step 6: Create apps/web/app/api/v1/clients/[clientId]/route.ts**

```typescript
import { NextResponse } from "next/server";
import { db } from "@smm/db/client";
import { clients } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { UpdateClientSchema } from "@smm/types/client";
import { requireWorkspace } from "@/lib/workspace";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );

  if (!client)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ client });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const body = await req.json();
  const parsed = UpdateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const [updated] = await db
    .update(clients)
    .set(parsed.data)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
      ),
    )
    .returning();

  if (!updated)
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ client: updated });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  await db
    .update(clients)
    .set({ deletedAt: new Date() })
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
      ),
    );

  return new Response(null, { status: 204 });
}
```

- [ ] **Step 7: Commit**

```bash
git add packages/types/ apps/web/app/api/v1/ tests/
git commit -m "feat: client CRUD API with workspace isolation"
```

---

### Task 10: Inngest setup

**Files:**

- Create: `packages/inngest/package.json`
- Create: `packages/inngest/src/client.ts`
- Create: `packages/inngest/src/functions/index.ts`
- Create: `apps/web/app/api/inngest/route.ts`

- [ ] **Step 1: Create packages/inngest/package.json**

```json
{
  "name": "@smm/inngest",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/client.ts",
    "./functions": "./src/functions/index.ts"
  },
  "dependencies": {
    "inngest": "^3.0.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create packages/inngest/src/client.ts**

```typescript
import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "smm-therapy",
  name: "SMM Therapy Platform",
});
```

- [ ] **Step 3: Create packages/inngest/src/functions/index.ts**

```typescript
import { inngest } from "../client";

export const smokeTest = inngest.createFunction(
  { id: "smoke-test" },
  { event: "test/smoke" },
  async ({ event }) => {
    return { ok: true, received: event.data };
  },
);

export const functions = [smokeTest];
```

- [ ] **Step 4: Create packages/inngest/src/index.ts**

```typescript
export { inngest } from "./client";
export { functions } from "./functions/index";
```

- [ ] **Step 5: Create apps/web/app/api/inngest/route.ts**

```typescript
import { serve } from "inngest/next";
import { inngest } from "@smm/inngest/client";
import { functions } from "@smm/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
});
```

- [ ] **Step 6: Add inngest to apps/web**

```bash
cd apps/web && pnpm add inngest @smm/inngest
```

- [ ] **Step 7: Verify Inngest dev server**

```bash
# Terminal 1
pnpm dev

# Terminal 2
pnpm dlx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Open http://localhost:8288. You should see "SMM Therapy Platform" connected with a `smoke-test` function listed.

Send a test event: in the Inngest UI, click "Send Event" → `test/smoke` → `{"data": {"hello": "world"}}`. Confirm the function runs successfully.

- [ ] **Step 8: Commit**

```bash
git add packages/inngest/ apps/web/app/api/inngest/
git commit -m "feat: add Inngest durable functions setup"
```

---

### Task 11: Cloudflare R2 storage

**Files:**

- Create: `packages/storage/package.json`
- Create: `packages/storage/src/r2.ts`
- Create: `packages/storage/src/index.ts`
- Create: `tests/unit/storage/r2.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/storage/r2.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the S3 client — we test our wrapper logic, not AWS SDK
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: vi.fn().mockImplementation(() => ({
    send: vi.fn(),
  })),
  PutObjectCommand: vi.fn(),
  GetObjectCommand: vi.fn(),
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn().mockResolvedValue("https://example.r2.dev/signed-url"),
}));

describe("R2 storage helpers", () => {
  beforeEach(() => {
    process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
    process.env.R2_ACCESS_KEY_ID = "test-key";
    process.env.R2_SECRET_ACCESS_KEY = "test-secret";
    process.env.R2_BUCKET_NAME = "test-bucket";
  });

  it("getPresignedUploadUrl returns a URL string", async () => {
    const { getPresignedUploadUrl } =
      await import("../../../packages/storage/src/r2");
    const url = await getPresignedUploadUrl(
      "uploads/test.pdf",
      "application/pdf",
    );
    expect(typeof url).toBe("string");
    expect(url).toContain("https://");
  });

  it("getPresignedDownloadUrl returns a URL string", async () => {
    const { getPresignedDownloadUrl } =
      await import("../../../packages/storage/src/r2");
    const url = await getPresignedDownloadUrl("uploads/test.pdf");
    expect(typeof url).toBe("string");
  });
});
```

- [ ] **Step 2: Run the test — should fail**

```bash
pnpm test -- tests/unit/storage/r2.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create packages/storage/package.json**

```json
{
  "name": "@smm/storage",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./r2": "./src/r2.ts"
  },
  "dependencies": {
    "@aws-sdk/client-s3": "^3.600.0",
    "@aws-sdk/s3-request-presigner": "^3.600.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 4: Create packages/storage/src/r2.ts**

```typescript
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getClient() {
  return new S3Client({
    region: "auto",
    endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn },
  );
}

export async function getPresignedDownloadUrl(
  key: string,
  expiresIn = 3600,
): Promise<string> {
  return getSignedUrl(
    getClient(),
    new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
    }),
    { expiresIn },
  );
}
```

- [ ] **Step 5: Create packages/storage/src/index.ts**

```typescript
export * from "./r2";
```

- [ ] **Step 6: Run the test — should pass**

```bash
pnpm test -- tests/unit/storage/r2.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/storage/ tests/unit/storage/
git commit -m "feat: add R2 storage helpers with presigned URLs"
```

---

### Task 12: compliance package skeleton

**Files:**

- Create: `packages/compliance/package.json`
- Create: `packages/compliance/src/schema.ts`
- Create: `packages/compliance/src/engine.ts`
- Create: `packages/compliance/src/index.ts`

- [ ] **Step 1: Create packages/compliance/package.json**

```json
{
  "name": "@smm/compliance",
  "version": "0.0.1",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./engine": "./src/engine.ts",
    "./schema": "./src/schema.ts"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create packages/compliance/src/schema.ts**

```typescript
import { z } from "zod";

export const RuleTypeSchema = z.enum(["prohibition", "requirement", "warning"]);

export const CredentialTypeSchema = z.enum([
  "LCSW",
  "LMFT",
  "LPC",
  "PsyD",
  "PhD",
  "MD",
  "Other",
]);

export const ComplianceRuleSchema = z.object({
  id: z.string().uuid(),
  ruleText: z.string(),
  ruleType: RuleTypeSchema,
  credentialTypes: z.array(CredentialTypeSchema),
  states: z.array(z.string().length(2)),
  sourceCitation: z.string(),
  version: z.string(),
});

export const ViolationSchema = z.object({
  ruleId: z.string().uuid(),
  offendingExcerpt: z.string(),
  explanation: z.string(),
  severity: z.enum(["critical", "warning"]),
  ruleType: RuleTypeSchema,
  sourceCitation: z.string(),
});

export type ComplianceRule = z.infer<typeof ComplianceRuleSchema>;
export type Violation = z.infer<typeof ViolationSchema>;
```

- [ ] **Step 3: Create packages/compliance/src/engine.ts**

```typescript
import type { ComplianceRule, Violation } from "./schema";

export type ClientContext = {
  state: string;
  credential: string;
};

/**
 * Returns the compliance rules applicable to a given client context.
 * Phase 1 will populate this with real rules.
 * Currently returns empty array (rules not yet seeded).
 */
export async function getRulesForClient(
  _ctx: ClientContext,
): Promise<ComplianceRule[]> {
  return [];
}

/**
 * Runs the compliance critic against generated content.
 * Phase 1 will implement this with the Claude Agent SDK.
 * Currently returns no violations (critic not yet implemented).
 */
export async function runComplianceCritic(
  _content: string,
  _rules: ComplianceRule[],
): Promise<{ violations: Violation[]; approved: boolean }> {
  return { violations: [], approved: true };
}
```

- [ ] **Step 4: Create packages/compliance/src/index.ts**

```typescript
export * from "./schema";
export * from "./engine";
```

- [ ] **Step 5: Commit**

```bash
git add packages/compliance/
git commit -m "feat: compliance package skeleton with empty engine"
```

---

### Task 13: Sentry

**Files:**

- Create: `apps/web/sentry.client.config.ts`
- Create: `apps/web/sentry.server.config.ts`
- Modify: `apps/web/next.config.ts`

- [ ] **Step 1: Run Sentry wizard**

```bash
cd apps/web
pnpm dlx @sentry/wizard@latest -i nextjs
```

Accept all defaults. This creates `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, and updates `next.config.ts`.

- [ ] **Step 2: Verify portal route group is covered**

Open `apps/web/sentry.server.config.ts`. Confirm `dsn` is set. The Next.js Sentry SDK automatically covers all route groups — no extra config needed for `(portal)`.

- [ ] **Step 3: Add SENTRY_SUPPRESS_TURBOPACK_WARNING=1 to dev script (optional)**

In `apps/web/package.json`:

```json
"dev": "SENTRY_SUPPRESS_TURBOPACK_WARNING=1 next dev"
```

- [ ] **Step 4: Trigger a test error to verify Sentry receives it**

Add this to `apps/web/app/(app)/dashboard/page.tsx` temporarily, load the page, then remove:

```tsx
throw new Error("Sentry test error — delete me");
```

Verify the error appears in your Sentry project dashboard.

- [ ] **Step 5: Commit**

```bash
git add apps/web/sentry.*.ts apps/web/next.config.ts
git commit -m "feat: add Sentry error tracking"
```

---

### Task 14: Basic app shell UI

**Files:**

- Create: `apps/web/app/(app)/layout.tsx`
- Create: `apps/web/components/app-sidebar.tsx`
- Create: `apps/web/app/(app)/dashboard/page.tsx`
- Create: `apps/web/app/(app)/clients/page.tsx`

- [ ] **Step 1: Add sidebar shadcn component**

```bash
cd apps/web
pnpm dlx shadcn@latest add sidebar navigation-menu avatar
```

- [ ] **Step 2: Create apps/web/components/app-sidebar.tsx**

```tsx
"use client";

import {
  useOrganizationList,
  OrganizationSwitcher,
  UserButton,
} from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clients", label: "Clients", icon: Users },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-screen w-60 flex-col border-r bg-background px-4 py-6 gap-6">
      <div>
        <OrganizationSwitcher
          hidePersonal
          afterCreateOrganizationUrl="/dashboard"
          afterSelectOrganizationUrl="/dashboard"
        />
      </div>

      <nav className="flex flex-col gap-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname.startsWith(href)
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto">
        <UserButton afterSignOutUrl="/" />
      </div>
    </aside>
  );
}
```

- [ ] **Step 3: Create apps/web/app/(app)/layout.tsx**

```tsx
import { AppSidebar } from "@/components/app-sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar />
      <main className="flex-1 overflow-y-auto p-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Create apps/web/app/(app)/dashboard/page.tsx**

```tsx
import { auth } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const { orgSlug } = await auth();
  return (
    <div>
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Workspace: {orgSlug ?? "No workspace selected"}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: Create apps/web/app/(app)/clients/page.tsx**

```tsx
export default function ClientsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold">Clients</h1>
      <p className="mt-2 text-muted-foreground">
        No clients yet. Phase 1 will add client creation UI.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: Verify the shell renders**

Start the dev server. Sign in, create an org (workspace). Navigate to /dashboard. Confirm sidebar shows, workspace switcher shows, nav links work.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/(app)/ apps/web/components/app-sidebar.tsx
git commit -m "feat: basic app shell with sidebar + workspace switcher"
```

---

### Task 15: Unstructured local dev service

**Files:**

- Create: `services/docker-compose.yml`

- [ ] **Step 1: Create services/docker-compose.yml**

```yaml
services:
  unstructured:
    image: downloads.unstructured.io/unstructured-io/unstructured-api:latest
    ports:
      - "8000:8000"
    environment:
      - UNSTRUCTURED_API_KEY=local-dev-key
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/healthcheck"]
      interval: 30s
      timeout: 10s
      retries: 3
```

Add to `.env.example`:

```bash
# Unstructured API (local: http://localhost:8000, prod: https://your-railway-service.up.railway.app)
UNSTRUCTURED_API_URL=http://localhost:8000
UNSTRUCTURED_API_KEY=local-dev-key
```

- [ ] **Step 2: Verify it starts**

```bash
docker compose -f services/docker-compose.yml up -d
curl http://localhost:8000/healthcheck
```

Expected: `{"status": "ok"}` or similar.

- [ ] **Step 3: Commit**

```bash
git add services/
git commit -m "chore: add Unstructured API local dev service"
```

---

### Task 16: Deploy to Vercel + submit Meta app review

**Files:**

- No new code — deployment and admin tasks

- [ ] **Step 1: Push to GitHub and connect Vercel**

```bash
git remote add origin https://github.com/<you>/smm-therapy.git
git push -u origin main
```

In Vercel: New Project → import repo → set root directory to `apps/web` → add all env vars from `.env.example`.

- [ ] **Step 2: Verify Vercel preview deployment**

Trigger a deploy. Confirm preview URL loads the sign-in page without errors.

- [ ] **Step 3: Submit Meta Business Platform app review**

Go to [Meta for Developers](https://developers.facebook.com/apps/). Create an app. Request permissions:

- `instagram_basic`
- `instagram_content_publish`
- `instagram_manage_insights`
- `pages_read_engagement`

Record a Loom (2-3 min) showing:

1. The app shell with workspace/client concept
2. A description of the use case: "Social media managers creating and scheduling Instagram content for licensed mental health practitioners"
3. The compliance focus (no automation without therapist approval)

Submit. Save the app ID in `.env.example` as `META_APP_ID`.

- [ ] **Step 4: Commit (env.example update)**

```bash
git add .env.example
git commit -m "chore: add Meta app ID to env.example"
```

---

## Phase 0 Complete

At this point you have:

- Working monorepo with Turborepo
- Next.js 15 app deployed to Vercel
- Clerk auth with workspace isolation via Orgs
- Neon Postgres with workspace_id isolation pattern verified by integration test
- Client CRUD API with workspace filtering
- Inngest durable functions wired
- Cloudflare R2 presigned URL helpers
- Compliance package skeleton
- Sentry error tracking
- Unstructured API local dev
- Meta app review submitted (~Week 2)

**Next:** `2026-05-20-phase-1-generation-core.md`
