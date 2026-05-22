# Phase 4: Client Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-facing approval portal with magic-link authentication so therapist clients can review, comment on, and approve/request changes to drafts — without needing a Clerk account.

**Architecture:** A separate `/portal/[clientSlug]/` route group (no Clerk middleware) hosts the client-facing portal. Magic-link auth: POST `/api/portal/auth/magic-link` stores a hashed HMAC-SHA256 token; GET `/api/portal/auth/verify` validates, marks consumed, sets an httpOnly SameSite=Lax cookie containing `clientId`. Portal API routes read `clientId` from the cookie and enforce client-scoped data access. Resend sends magic-link emails. New DB tables: `magic_link_tokens`, `draft_comments`. React-PDF generates monthly PDF reports (downloadable by workspace).

**Tech Stack:** drizzle-orm · Next.js App Router route groups · node:crypto HMAC-SHA256 · AES-256-GCM cookie encryption · Resend (email) · `@react-pdf/renderer` · shadcn/ui

**Security constraints (mandatory):**

- `PORTAL_SECRET` = 32-byte random hex in `.env.example`; never commit real value
- Magic-link tokens: 15-min expiry, single-use (mark `consumedAt` on verify)
- Rate limit magic-link: 5 requests/hour per email (use `magic_link_tokens` count check)
- Cookie: `httpOnly: true`, `sameSite: "lax"`, `maxAge: 86400` (24h), `path: "/portal"`
- Cookie value: AES-256-GCM encrypted `{ clientId, issuedAt }` — not a plain session ID

---

## File Structure

```
packages/db/src/schema/
├── portal.ts               NEW: magic_link_tokens, draft_comments tables
└── index.ts                MODIFY: export portal tables

packages/db/migrations/
└── 0005_portal.sql         NEW: migration SQL

apps/web/
├── lib/
│   ├── portal-auth.ts       NEW: generateMagicToken(), verifyMagicToken(),
│   │                              encryptCookie(), decryptCookie(), getPortalSession()
│   └── email.ts             NEW: Resend client + sendMagicLinkEmail()
├── middleware.ts             MODIFY: exclude /portal/* from Clerk auth
└── app/
    ├── portal/
    │   └── [clientSlug]/
    │       ├── layout.tsx     NEW: portal layout (no Clerk, custom branding)
    │       ├── page.tsx       NEW: draft list for portal client
    │       └── draft/
    │           └── [draftId]/
    │               └── page.tsx  NEW: draft detail with approve/reject + comments
    └── api/
        ├── portal/
        │   ├── auth/
        │   │   ├── magic-link/route.ts  NEW: POST send magic link
        │   │   └── verify/route.ts      NEW: GET validate token, set cookie
        │   └── drafts/
        │       └── [draftId]/
        │           ├── approve/route.ts          NEW: POST approve
        │           ├── request-changes/route.ts   NEW: POST request changes
        │           └── comments/route.ts          NEW: GET/POST comments
        └── v1/clients/[clientId]/drafts/[draftId]/
            └── send-for-review/route.ts           NEW: POST (workspace → ready_for_client)

packages/types/src/
└── portal.ts               NEW: MagicLinkSchema, CommentSchema
```

---

### Task 1: DB Schema — portal tables

**Files:**

- Create: `packages/db/src/schema/portal.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/src/schema/__tests__/portal.test.ts
import { describe, it, expect } from "vitest";

describe("portal schema", () => {
  it("exports magicLinkTokens", async () => {
    const mod = await import("../portal");
    expect(mod.magicLinkTokens).toBeDefined();
    expect(mod.draftComments).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/db test`
Expected: FAIL — "portal" module not found

- [ ] **Step 3: Create portal schema**

```typescript
// packages/db/src/schema/portal.ts
import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { clients } from "./clients";
import { drafts } from "./drafts";

export const authorTypeEnum = pgEnum("portal_author_type", [
  "workspace",
  "client",
]);

export const magicLinkTokens = pgTable("magic_link_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const draftComments = pgTable("draft_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  authorType: authorTypeEnum("author_type").notNull(),
  authorName: text("author_name").notNull(),
  body: text("body").notNull(),
  parentId: uuid("parent_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MagicLinkToken = typeof magicLinkTokens.$inferSelect;
export type DraftComment = typeof draftComments.$inferSelect;
```

Add to `packages/db/src/schema/index.ts`:

```typescript
export * from "./portal";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smm/db test`
Expected: PASS

- [ ] **Step 5: Generate migration**

```bash
pnpm --filter @smm/db migrate:generate
pnpm --filter @smm/db migrate
```

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/schema/portal.ts packages/db/src/schema/index.ts
git commit -m "feat: add magic_link_tokens and draft_comments tables"
```

---

### Task 2: Portal Auth Utilities

**Files:**

- Create: `apps/web/lib/portal-auth.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/lib/__tests__/portal-auth.test.ts
import { describe, it, expect, vi, beforeAll } from "vitest";

beforeAll(() => {
  process.env.PORTAL_SECRET = "a".repeat(64); // 32 bytes hex
});

describe("portal auth utilities", () => {
  it("generateMagicToken returns 64 hex chars", async () => {
    const { generateMagicToken } = await import("../portal-auth");
    const { rawToken } = generateMagicToken();
    expect(rawToken).toHaveLength(64);
    expect(rawToken).toMatch(/^[0-9a-f]+$/);
  });

  it("hashToken is deterministic", async () => {
    const { hashToken } = await import("../portal-auth");
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("def"));
  });

  it("encryptCookie/decryptCookie roundtrip", async () => {
    const { encryptCookie, decryptCookie } = await import("../portal-auth");
    const payload = { clientId: "test-id", issuedAt: Date.now() };
    const encrypted = encryptCookie(payload);
    const decrypted = decryptCookie(encrypted);
    expect(decrypted).toMatchObject(payload);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/web test`
Expected: FAIL — "portal-auth" not found

- [ ] **Step 3: Implement portal auth utilities**

```typescript
// apps/web/lib/portal-auth.ts
import crypto from "node:crypto";
import { cookies } from "next/headers";

function getSecret(): Buffer {
  const hex = process.env.PORTAL_SECRET;
  if (!hex || hex.length < 64) {
    throw new Error("PORTAL_SECRET must be at least 32 bytes (64 hex chars)");
  }
  return Buffer.from(hex.slice(0, 64), "hex");
}

export function generateMagicToken(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  return { rawToken, tokenHash: hashToken(rawToken) };
}

export function hashToken(rawToken: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(rawToken)
    .digest("hex");
}

export function encryptCookie(payload: {
  clientId: string;
  issuedAt: number;
}): string {
  const key = getSecret();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const json = JSON.stringify(payload);
  const enc = Buffer.concat([cipher.update(json, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptCookie(
  value: string,
): { clientId: string; issuedAt: number } | null {
  try {
    const key = getSecret();
    const buf = Buffer.from(value, "base64url");
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(dec.toString("utf8")) as {
      clientId: string;
      issuedAt: number;
    };
  } catch {
    return null;
  }
}

export async function getPortalSession(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get("portal_session")?.value;
  if (!value) return null;
  const payload = decryptCookie(value);
  if (!payload) return null;
  const maxAge = 24 * 60 * 60 * 1000;
  if (Date.now() - payload.issuedAt > maxAge) return null;
  return payload.clientId;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smm/web test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/portal-auth.ts
git commit -m "feat: add portal auth utilities (magic token, cookie encrypt/decrypt)"
```

---

### Task 3: Resend Email + Magic-Link API Route

**Files:**

- Create: `apps/web/lib/email.ts`
- Create: `apps/web/app/api/portal/auth/magic-link/route.ts`
- Create: `apps/web/app/api/portal/auth/verify/route.ts`

**Prerequisites:** Add `resend` package: `pnpm --filter @smm/web add resend`

- [ ] **Step 1: Write failing test (schema validation)**

```typescript
// packages/types/src/__tests__/portal.test.ts
import { describe, it, expect } from "vitest";
import { MagicLinkSchema } from "../portal";

describe("MagicLinkSchema", () => {
  it("requires valid email", () => {
    expect(
      MagicLinkSchema.safeParse({ email: "bad", clientSlug: "slug" }).success,
    ).toBe(false);
    expect(
      MagicLinkSchema.safeParse({
        email: "a@b.com",
        clientSlug: "slug",
      }).success,
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/types test`
Expected: FAIL — "portal" not found

- [ ] **Step 3: Create portal types**

```typescript
// packages/types/src/portal.ts
import { z } from "zod";

export const MagicLinkSchema = z.object({
  email: z.string().email(),
  clientSlug: z.string().min(1),
});
export type MagicLinkInput = z.infer<typeof MagicLinkSchema>;

export const CommentSchema = z.object({
  body: z.string().min(1).max(2000),
  parentId: z.string().uuid().optional(),
});
export type CommentInput = z.infer<typeof CommentSchema>;
```

Add to `packages/types/src/index.ts`:

```typescript
export * from "./portal";
```

- [ ] **Step 4: Create email utility**

```typescript
// apps/web/lib/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendMagicLinkEmail(
  to: string,
  magicUrl: string,
  clientName: string,
): Promise<void> {
  await resend.emails.send({
    from: "noreply@yourdomain.com",
    to,
    subject: `Review content for ${clientName}`,
    html: `
      <p>Hi,</p>
      <p>You've been invited to review social media content for <strong>${clientName}</strong>.</p>
      <p><a href="${magicUrl}" style="background:#18181b;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;margin:12px 0;">Review Content</a></p>
      <p>This link expires in 15 minutes and can only be used once.</p>
    `,
  });
}
```

- [ ] **Step 5: Create magic-link send route**

```typescript
// apps/web/app/api/portal/auth/magic-link/route.ts
import { NextResponse } from "next/server";
import { db } from "@smm/db/client";
import { clients, magicLinkTokens } from "@smm/db/schema";
import { eq, and, gt, count } from "drizzle-orm";
import { generateMagicToken } from "@/lib/portal-auth";
import { sendMagicLinkEmail } from "@/lib/email";
import { MagicLinkSchema } from "@smm/types/portal";

export async function POST(req: Request) {
  const body = await req.json();
  const parsed = MagicLinkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { email, clientSlug } = parsed.data;

  const [client] = await db
    .select()
    .from(clients)
    .where(eq(clients.slug, clientSlug));
  if (!client) {
    // Return 200 to avoid slug enumeration
    return NextResponse.json({ ok: true });
  }

  // Rate limit: max 5 tokens issued in last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const [{ value: recentCount }] = await db
    .select({ value: count() })
    .from(magicLinkTokens)
    .where(
      and(
        eq(magicLinkTokens.email, email),
        eq(magicLinkTokens.clientId, client.id),
        gt(magicLinkTokens.createdAt, oneHourAgo),
      ),
    );

  if (recentCount >= 5) {
    return NextResponse.json(
      { error: "Too many requests. Try again in an hour." },
      { status: 429 },
    );
  }

  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const { rawToken, tokenHash } = generateMagicToken();

  await db.insert(magicLinkTokens).values({
    clientId: client.id,
    workspaceId: client.workspaceId,
    email,
    tokenHash,
    expiresAt,
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const magicUrl = `${baseUrl}/api/portal/auth/verify?token=${rawToken}&slug=${clientSlug}`;

  await sendMagicLinkEmail(email, magicUrl, client.name);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Create verify route**

```typescript
// apps/web/app/api/portal/auth/verify/route.ts
import { NextResponse } from "next/server";
import { db } from "@smm/db/client";
import { magicLinkTokens } from "@smm/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { hashToken, encryptCookie } from "@/lib/portal-auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const rawToken = searchParams.get("token");
  const slug = searchParams.get("slug");

  if (!rawToken || !slug) {
    return NextResponse.redirect(
      new URL(`/portal/${slug ?? ""}?error=invalid`, req.url),
    );
  }

  const tokenHash = hashToken(rawToken);

  const [tokenRow] = await db
    .select()
    .from(magicLinkTokens)
    .where(
      and(
        eq(magicLinkTokens.tokenHash, tokenHash),
        isNull(magicLinkTokens.consumedAt),
      ),
    );

  if (!tokenRow || tokenRow.expiresAt < new Date()) {
    return NextResponse.redirect(
      new URL(`/portal/${slug}?error=expired`, req.url),
    );
  }

  await db
    .update(magicLinkTokens)
    .set({ consumedAt: new Date() })
    .where(eq(magicLinkTokens.id, tokenRow.id));

  const cookieValue = encryptCookie({
    clientId: tokenRow.clientId,
    issuedAt: Date.now(),
  });

  const response = NextResponse.redirect(new URL(`/portal/${slug}`, req.url));
  response.cookies.set("portal_session", cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 86400,
    path: "/portal",
  });
  return response;
}
```

- [ ] **Step 7: Run types test to verify it passes**

Run: `pnpm --filter @smm/types test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/lib/email.ts apps/web/app/api/portal/
git commit -m "feat: add magic-link send/verify portal auth routes"
```

---

### Task 4: Clerk Middleware Exclusion

**Files:**

- Modify: `apps/web/middleware.ts`

The Clerk middleware must not run on `/portal/*` routes (no Clerk session there).

- [ ] **Step 1: Read current middleware**

Read: `apps/web/middleware.ts`

- [ ] **Step 2: Add portal exclusion**

Find the Clerk `clerkMiddleware` or `authMiddleware` call and add the portal path to the public/excluded routes. Exact change depends on current middleware content, but the pattern is:

```typescript
// In the matcher or publicRoutes config, add:
// "/portal(.*)",
// "/api/portal(.*)",

export const config = {
  matcher: [
    // existing matchers...
    "/((?!portal|api/portal|_next/static|_next/image|favicon.ico).*)",
  ],
};
```

Or if using `clerkMiddleware` with `isPublicRoute`:

```typescript
const isPublicRoute = createRouteMatcher([
  "/portal(.*)",
  "/api/portal(.*)",
  // ... existing public routes
]);
```

- [ ] **Step 3: Verify middleware change does not break app routes**

Run: `pnpm --filter @smm/web dev`
Navigate to `/dashboard` — should still require auth.
Navigate to `/portal/test-slug` — should NOT redirect to Clerk sign-in.

- [ ] **Step 4: Commit**

```bash
git add apps/web/middleware.ts
git commit -m "feat: exclude portal routes from Clerk middleware"
```

---

### Task 5: Portal API Routes

**Files:**

- Create: `apps/web/app/api/portal/drafts/[draftId]/approve/route.ts`
- Create: `apps/web/app/api/portal/drafts/[draftId]/request-changes/route.ts`
- Create: `apps/web/app/api/portal/drafts/[draftId]/comments/route.ts`
- Create: `apps/web/app/api/v1/clients/[clientId]/drafts/[draftId]/send-for-review/route.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/web/app/api/portal/__tests__/portal-routes.test.ts
import { describe, it, expect } from "vitest";
import { CommentSchema } from "@smm/types/portal";

describe("CommentSchema", () => {
  it("requires body", () => {
    expect(CommentSchema.safeParse({}).success).toBe(false);
    expect(CommentSchema.safeParse({ body: "Great post!" }).success).toBe(true);
  });

  it("limits body to 2000 chars", () => {
    expect(CommentSchema.safeParse({ body: "x".repeat(2001) }).success).toBe(
      false,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it passes (already defined in Task 3)**

Run: `pnpm --filter @smm/types test`
Expected: PASS

- [ ] **Step 3: Create approve route**

```typescript
// apps/web/app/api/portal/drafts/[draftId]/approve/route.ts
import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@smm/db/client";
import { drafts } from "@smm/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const clientId = await getPortalSession();
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { draftId } = await params;

  const [updated] = await db
    .update(drafts)
    .set({ status: "approved" })
    .where(and(eq(drafts.id, draftId), eq(drafts.clientId, clientId)))
    .returning({ id: drafts.id });

  if (!updated) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Create request-changes route**

```typescript
// apps/web/app/api/portal/drafts/[draftId]/request-changes/route.ts
import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@smm/db/client";
import { drafts, draftComments } from "@smm/db/schema";
import { eq, and } from "drizzle-orm";
import { CommentSchema } from "@smm/types/portal";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const clientId = await getPortalSession();
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { draftId } = await params;

  const [draft] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.clientId, clientId)));
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  await db
    .update(drafts)
    .set({ status: "changes_requested" })
    .where(eq(drafts.id, draftId));

  await db.insert(draftComments).values({
    draftId,
    workspaceId: draft.workspaceId,
    clientId,
    authorType: "client",
    authorName: "Client",
    body: parsed.data.body,
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Create comments route**

```typescript
// apps/web/app/api/portal/drafts/[draftId]/comments/route.ts
import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@smm/db/client";
import { drafts, draftComments } from "@smm/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { CommentSchema } from "@smm/types/portal";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const clientId = await getPortalSession();
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { draftId } = await params;

  const rows = await db
    .select()
    .from(draftComments)
    .where(
      and(
        eq(draftComments.draftId, draftId),
        eq(draftComments.clientId, clientId),
      ),
    )
    .orderBy(asc(draftComments.createdAt));

  return NextResponse.json({ comments: rows });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const clientId = await getPortalSession();
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { draftId } = await params;

  const [draft] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.clientId, clientId)));
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const [comment] = await db
    .insert(draftComments)
    .values({
      draftId,
      workspaceId: draft.workspaceId,
      clientId,
      authorType: "client",
      authorName: "Client",
      body: parsed.data.body,
      parentId: parsed.data.parentId,
    })
    .returning();

  return NextResponse.json({ comment }, { status: 201 });
}
```

- [ ] **Step 6: Create workspace-side send-for-review route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/drafts/[draftId]/send-for-review/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { drafts } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { draftId } = await params;

  const [updated] = await db
    .update(drafts)
    .set({ status: "ready_for_client" })
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.id, draftId),
        isNull(drafts.deletedAt),
      ),
    )
    .returning({ id: drafts.id });

  if (!updated) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/portal/ apps/web/app/api/v1/clients/
git commit -m "feat: add portal approve/request-changes/comments API routes"
```

---

### Task 6: Portal UI Pages

**Files:**

- Create: `apps/web/app/portal/[clientSlug]/layout.tsx`
- Create: `apps/web/app/portal/[clientSlug]/page.tsx`
- Create: `apps/web/app/portal/[clientSlug]/draft/[draftId]/page.tsx`

- [ ] **Step 1: Create portal layout**

```tsx
// apps/web/app/portal/[clientSlug]/layout.tsx
import type { ReactNode } from "react";

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b bg-white px-6 py-4">
        <p className="text-sm font-medium text-muted-foreground">
          Content Review Portal
        </p>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Create portal home page (magic link request + draft list)**

```tsx
// apps/web/app/portal/[clientSlug]/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type DraftRow = {
  id: string;
  hook: string;
  status: string;
  scheduledAt: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  ready_for_client: "Awaiting your review",
  client_reviewing: "In review",
  approved: "Approved",
  changes_requested: "Changes requested",
  scheduled: "Scheduled",
  published: "Published",
};

export default function PortalHomePage() {
  const { clientSlug } = useParams<{ clientSlug: string }>();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/portal/drafts?slug=${clientSlug}`);
      if (res.ok) {
        const data = (await res.json()) as { drafts: DraftRow[] };
        setDrafts(data.drafts);
      } else if (res.status === 401) {
        setDrafts(null);
      }
    })();
  }, [clientSlug]);

  async function handleSendLink() {
    setSending(true);
    await fetch("/api/portal/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, clientSlug }),
    });
    setSent(true);
    setSending(false);
  }

  if (drafts !== null) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Your Content</h1>
        {drafts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No drafts ready for review yet.
          </p>
        )}
        {drafts.map((d) => (
          <Link
            key={d.id}
            href={`/portal/${clientSlug}/draft/${d.id}`}
            className="block rounded-md border bg-white p-4 hover:shadow-sm transition"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{d.hook}</p>
              <Badge className="shrink-0 text-xs">
                {STATUS_LABELS[d.status] ?? d.status}
              </Badge>
            </div>
            {d.scheduledAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(d.scheduledAt).toLocaleDateString()}
              </p>
            )}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Content Review</h1>

      {error === "expired" && (
        <Alert variant="destructive">
          <AlertDescription>
            This link has expired or already been used. Request a new one below.
          </AlertDescription>
        </Alert>
      )}

      {sent ? (
        <Alert>
          <AlertDescription>
            Check your email — a sign-in link is on its way. It expires in 15
            minutes.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3 rounded-md border bg-white p-6">
          <p className="text-sm text-muted-foreground">
            Enter your email address to receive a one-time sign-in link.
          </p>
          <div className="space-y-1">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button
            onClick={handleSendLink}
            disabled={!email || sending}
            className="w-full"
          >
            {sending ? "Sending…" : "Send sign-in link"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create portal draft approval page**

```tsx
// apps/web/app/portal/[clientSlug]/draft/[draftId]/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, MessageSquare, ArrowLeft } from "lucide-react";
import Link from "next/link";

type DraftRow = {
  id: string;
  hook: string;
  caption: string;
  hashtags: string[];
  status: string;
};

type CommentRow = {
  id: string;
  authorType: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export default function PortalDraftPage() {
  const { clientSlug, draftId } = useParams<{
    clientSlug: string;
    draftId: string;
  }>();
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState("");
  const [feedback, setFeedback] = useState("");
  const [actionDone, setActionDone] = useState<
    "approved" | "changes_requested" | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch(`/api/portal/drafts/${draftId}`).then(async (r) => {
        if (r.ok) setDraft(((await r.json()) as { draft: DraftRow }).draft);
      }),
      fetch(`/api/portal/drafts/${draftId}/comments`).then(async (r) => {
        if (r.ok)
          setComments(
            ((await r.json()) as { comments: CommentRow[] }).comments,
          );
      }),
    ]);
  }, [draftId]);

  async function handleApprove() {
    setLoading(true);
    const res = await fetch(`/api/portal/drafts/${draftId}/approve`, {
      method: "POST",
    });
    if (res.ok) {
      setActionDone("approved");
    } else {
      setError("Could not approve. Please try again.");
    }
    setLoading(false);
  }

  async function handleRequestChanges() {
    if (!feedback.trim()) {
      setError("Please describe the changes needed.");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/portal/drafts/${draftId}/request-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: feedback }),
    });
    if (res.ok) {
      setActionDone("changes_requested");
    } else {
      setError("Could not submit feedback. Please try again.");
    }
    setLoading(false);
  }

  async function handleAddComment() {
    if (!commentText.trim()) return;
    const res = await fetch(`/api/portal/drafts/${draftId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentText }),
    });
    if (res.ok) {
      const data = (await res.json()) as { comment: CommentRow };
      setComments((prev) => [...prev, data.comment]);
      setCommentText("");
    }
  }

  if (!draft) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <Link href={`/portal/${clientSlug}`}>
        <Button variant="ghost" size="sm" className="gap-1">
          <ArrowLeft className="h-4 w-4" /> All content
        </Button>
      </Link>

      {actionDone === "approved" && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Approved! Your feedback has been recorded.
          </AlertDescription>
        </Alert>
      )}
      {actionDone === "changes_requested" && (
        <Alert>
          <AlertDescription>
            Changes requested. Your team has been notified.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border bg-white p-5 space-y-4">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-medium">{draft.hook}</h2>
          <Badge>{draft.status.replace(/_/g, " ")}</Badge>
        </div>
        <p className="text-sm whitespace-pre-wrap">{draft.caption}</p>
        {draft.hashtags.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {draft.hashtags.map((h) => `#${h}`).join(" ")}
          </p>
        )}
      </div>

      {!actionDone && draft.status === "ready_for_client" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Button
              onClick={handleApprove}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </div>

          <div className="space-y-2">
            <Textarea
              placeholder="What would you like changed?"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
            />
            <Button
              variant="outline"
              onClick={handleRequestChanges}
              disabled={loading || !feedback.trim()}
              className="w-full"
            >
              Request Changes
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Comments ({comments.length})
        </h3>
        {comments.map((c) => (
          <div key={c.id} className="rounded-md border bg-white p-3 text-sm">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium">{c.authorName}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(c.createdAt).toLocaleString()}
              </span>
            </div>
            <p>{c.body}</p>
          </div>
        ))}
        <div className="flex gap-2">
          <Textarea
            placeholder="Add a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={2}
            className="flex-1"
          />
          <Button
            variant="outline"
            onClick={handleAddComment}
            disabled={!commentText.trim()}
          >
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add portal draft list endpoint**

```typescript
// apps/web/app/api/portal/drafts/route.ts
import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@smm/db/client";
import { drafts, clients } from "@smm/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";

export async function GET(req: Request) {
  const clientId = await getPortalSession();
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(drafts)
    .where(
      and(
        eq(drafts.clientId, clientId),
        isNull(drafts.deletedAt),
        inArray(drafts.status, [
          "ready_for_client",
          "client_reviewing",
          "approved",
          "changes_requested",
          "scheduled",
          "published",
        ]),
      ),
    )
    .orderBy(drafts.scheduledAt);

  return NextResponse.json({ drafts: rows });
}
```

Also add `GET /api/portal/drafts/[draftId]/route.ts`:

```typescript
// apps/web/app/api/portal/drafts/[draftId]/route.ts
import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@smm/db/client";
import { drafts } from "@smm/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const clientId = await getPortalSession();
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { draftId } = await params;
  const [draft] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.clientId, clientId)));

  if (!draft) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ draft });
}
```

- [ ] **Step 5: Verify in dev server**

Run: `pnpm --filter @smm/web dev`
Open `/portal/[some-slug]` — should show the email form.
Submit email — should show "check your email" confirmation (Resend may need API key configured).
After verifying token manually in DB, navigate to `/portal/[slug]` — should show draft list.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/portal/ apps/web/app/api/portal/
git commit -m "feat: add client portal UI pages and draft list/detail routes"
```

---

### Task 7: Monthly PDF Report

**Files:**

- Create: `apps/web/app/api/v1/clients/[clientId]/reports/[month]/route.ts`

**Prerequisites:** Install React-PDF: `pnpm --filter @smm/web add @react-pdf/renderer`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/app/api/v1/clients/[clientId]/reports/__tests__/report.test.ts
import { describe, it, expect } from "vitest";
import { buildReportData } from "../[month]/report-data";

describe("buildReportData", () => {
  it("counts published drafts", () => {
    const data = buildReportData(
      [
        { status: "published", format: "story" },
        { status: "approved", format: "cta" },
        { status: "published", format: "cta" },
      ] as Parameters<typeof buildReportData>[0],
      "2026-06",
    );
    expect(data.publishedCount).toBe(2);
    expect(data.approvedCount).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/web test`
Expected: FAIL

- [ ] **Step 3: Create report data helper**

```typescript
// apps/web/app/api/v1/clients/[clientId]/reports/[month]/report-data.ts
type DraftSummary = {
  status: string;
  format: string | null;
  complianceApproved: boolean;
};

export type ReportData = {
  month: string;
  publishedCount: number;
  approvedCount: number;
  changesRequestedCount: number;
  formatBreakdown: Record<string, number>;
  complianceRate: number;
};

export function buildReportData(
  drafts: DraftSummary[],
  month: string,
): ReportData {
  const published = drafts.filter((d) => d.status === "published");
  const approved = drafts.filter((d) => d.status === "approved");
  const changesRequested = drafts.filter(
    (d) => d.status === "changes_requested",
  );

  const formatBreakdown: Record<string, number> = {};
  for (const d of drafts) {
    const fmt = d.format ?? "unknown";
    formatBreakdown[fmt] = (formatBreakdown[fmt] ?? 0) + 1;
  }

  const compliantCount = drafts.filter((d) => d.complianceApproved).length;
  const complianceRate =
    drafts.length > 0
      ? Math.round((compliantCount / drafts.length) * 100)
      : 100;

  return {
    month,
    publishedCount: published.length,
    approvedCount: approved.length,
    changesRequestedCount: changesRequested.length,
    formatBreakdown,
    complianceRate,
  };
}
```

- [ ] **Step 4: Create the PDF report route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/reports/[month]/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, drafts } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq, gte, lte } from "@smm/db/rls";
import { renderToBuffer, Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import { buildReportData } from "./report-data";

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  subtitle: { fontSize: 12, color: "#666", marginBottom: 24 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  label: { fontSize: 11, color: "#444" },
  value: { fontSize: 11, fontWeight: "bold" },
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; month: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, month } = await params;

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
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const [year, mo] = month.split("-").map(Number) as [number, number];
  const start = new Date(year, mo - 1, 1);
  const end = new Date(year, mo, 0, 23, 59, 59);

  const draftRows = await db
    .select({
      status: drafts.status,
      format: drafts.format,
      complianceApproved: drafts.complianceApproved,
    })
    .from(drafts)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.clientId, clientId),
        isNull(drafts.deletedAt),
        gte(drafts.scheduledAt, start),
        lte(drafts.scheduledAt, end),
      ),
    );

  const data = buildReportData(draftRows, month);

  const pdf = await renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Monthly Content Report</Text>
        <Text style={styles.subtitle}>
          {client.name} — {month}
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Summary</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Published</Text>
            <Text style={styles.value}>{data.publishedCount}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Approved (pending publish)</Text>
            <Text style={styles.value}>{data.approvedCount}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Changes requested</Text>
            <Text style={styles.value}>{data.changesRequestedCount}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Compliance pass rate</Text>
            <Text style={styles.value}>{data.complianceRate}%</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Format Breakdown</Text>
          {Object.entries(data.formatBreakdown).map(([fmt, cnt]) => (
            <View key={fmt} style={styles.row}>
              <Text style={styles.label}>{fmt.replace(/_/g, " ")}</Text>
              <Text style={styles.value}>{cnt}</Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>,
  );

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${client.slug}-${month}.pdf"`,
    },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @smm/web test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/api/v1/clients/[clientId]/reports/"
git commit -m "feat: add monthly PDF report generation endpoint"
```

---

### Manual prerequisites (do before or during this phase)

- [ ] Add `RESEND_API_KEY` and `PORTAL_SECRET` to `.env.example` (Claude cannot write `.env*` files)
- [ ] Add `resend` and `@react-pdf/renderer` as dependencies: `pnpm --filter @smm/web add resend @react-pdf/renderer`
- [ ] Register a Resend sending domain and update `from:` address in `email.ts`
- [ ] Run `pnpm --filter @smm/db migrate` after creating schema
