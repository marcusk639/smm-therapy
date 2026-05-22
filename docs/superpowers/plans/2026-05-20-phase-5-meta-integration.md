# Phase 5: Meta Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect each client's Instagram account via Facebook OAuth, publish approved drafts to Instagram (image, carousel, Reels, Stories), sync post status back, and pull daily engagement metrics (reach, impressions, likes, comments, saves) into the platform.

**Architecture:** Instagram OAuth tokens stored AES-256-GCM encrypted in a new `instagram_tokens` table. An `ig-publish` Inngest function handles async publishing with retries (container creation → publish). A daily `ig-metrics-sync` Inngest cron updates a `post_metrics` table. Draft `igMediaId` is written on successful publish; `status` transitions to "published". A workspace-side UI page manages the OAuth connection flow.

**Tech Stack:** drizzle-orm · Meta Graph API v21 · Inngest step functions + cron · node:crypto AES-256-GCM · Next.js App Router

**Security constraints:**

- `IG_APP_ID` and `IG_APP_SECRET` in `.env.example`, never committed
- Access tokens stored encrypted with AES-256-GCM using a `INSTAGRAM_TOKEN_KEY` (32-byte hex)
- Refresh tokens (long-lived tokens) rotated every 50 days via Inngest cron
- No access tokens ever logged or returned to the frontend

**Important:** Meta app requires **Instagram Graph API** permissions: `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `pages_show_list`. App must be in "Live" mode. Submit for App Review before enabling for real clients (can take 1–2 weeks).

---

## File Structure

```
packages/db/src/schema/
├── instagram.ts         NEW: instagramTokens, postMetrics tables
└── index.ts             MODIFY: export instagram tables

packages/db/migrations/
└── 0006_instagram.sql   NEW: migration SQL

apps/web/
├── lib/
│   └── ig-crypto.ts      NEW: encryptToken(), decryptToken()
└── app/
    ├── api/v1/clients/[clientId]/
    │   ├── instagram/
    │   │   ├── connect/route.ts    NEW: GET initiate OAuth
    │   │   ├── callback/route.ts   NEW: GET handle OAuth callback
    │   │   └── status/route.ts     NEW: GET connection status
    │   └── drafts/[draftId]/
    │       └── publish/route.ts    NEW: POST enqueue publish job
    └── (app)/clients/[clientId]/
        └── instagram/page.tsx      NEW: IG connection + publish UI

packages/inngest/src/functions/
├── ig-publish.ts         NEW: "instagram/publish" event handler
└── ig-metrics-sync.ts    NEW: daily cron to sync engagement metrics
```

---

### Task 1: DB Schema — instagramTokens + postMetrics

**Files:**

- Create: `packages/db/src/schema/instagram.ts`
- Modify: `packages/db/src/schema/index.ts`
- Modify: `packages/db/src/schema/drafts.ts` — add `igMediaId` column

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/src/schema/__tests__/instagram.test.ts
import { describe, it, expect } from "vitest";

describe("instagram schema", () => {
  it("exports instagramTokens", async () => {
    const mod = await import("../instagram");
    expect(mod.instagramTokens).toBeDefined();
    expect(mod.postMetrics).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/db test`
Expected: FAIL — "instagram" module not found

- [ ] **Step 3: Create instagram schema**

```typescript
// packages/db/src/schema/instagram.ts
import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";
import { clients } from "./clients";
import { drafts } from "./drafts";

export const instagramTokens = pgTable("instagram_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  clientId: uuid("client_id")
    .notNull()
    .unique()
    .references(() => clients.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  igUserId: text("ig_user_id").notNull(),
  igUsername: text("ig_username"),
  encryptedToken: text("encrypted_token").notNull(),
  tokenType: text("token_type").notNull().default("long_lived"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  scopes: text("scopes").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const postMetrics = pgTable("post_metrics", {
  id: uuid("id").defaultRandom().primaryKey(),
  draftId: uuid("draft_id")
    .notNull()
    .references(() => drafts.id, { onDelete: "cascade" }),
  clientId: uuid("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  igMediaId: text("ig_media_id").notNull(),
  reach: integer("reach").notNull().default(0),
  impressions: integer("impressions").notNull().default(0),
  likes: integer("likes").notNull().default(0),
  comments: integer("comments").notNull().default(0),
  saves: integer("saves").notNull().default(0),
  shares: integer("shares").notNull().default(0),
  recordedAt: timestamp("recorded_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type InstagramToken = typeof instagramTokens.$inferSelect;
export type PostMetric = typeof postMetrics.$inferSelect;
```

Add `igMediaId` to `packages/db/src/schema/drafts.ts` after `scheduledAt`:

```typescript
  igMediaId: text("ig_media_id"),
```

Add to `packages/db/src/schema/index.ts`:

```typescript
export * from "./instagram";
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
git add packages/db/src/schema/instagram.ts packages/db/src/schema/drafts.ts packages/db/src/schema/index.ts
git commit -m "feat: add instagram_tokens and post_metrics tables"
```

---

### Task 2: Token Encryption Utilities

**Files:**

- Create: `apps/web/lib/ig-crypto.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/web/lib/__tests__/ig-crypto.test.ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.INSTAGRAM_TOKEN_KEY = "b".repeat(64);
});

describe("ig-crypto", () => {
  it("encryptToken/decryptToken roundtrip", async () => {
    const { encryptToken, decryptToken } = await import("../ig-crypto");
    const token = "EAABsbCS1iHgBOZD";
    const encrypted = encryptToken(token);
    expect(encrypted).not.toBe(token);
    expect(decryptToken(encrypted)).toBe(token);
  });

  it("different encryptions of same value differ (random IV)", async () => {
    const { encryptToken } = await import("../ig-crypto");
    expect(encryptToken("token")).not.toBe(encryptToken("token"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/web test`
Expected: FAIL — module not found

- [ ] **Step 3: Implement token crypto**

```typescript
// apps/web/lib/ig-crypto.ts
import crypto from "node:crypto";

function getKey(): Buffer {
  const hex = process.env.INSTAGRAM_TOKEN_KEY;
  if (!hex || hex.length < 64) {
    throw new Error("INSTAGRAM_TOKEN_KEY must be 32 bytes (64 hex chars)");
  }
  return Buffer.from(hex.slice(0, 64), "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64url");
}

export function decryptToken(ciphertext: string): string {
  const key = getKey();
  const buf = Buffer.from(ciphertext, "base64url");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    "utf8",
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smm/web test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/ig-crypto.ts
git commit -m "feat: add AES-256-GCM Instagram token encryption"
```

---

### Task 3: Instagram OAuth Routes

**Files:**

- Create: `apps/web/app/api/v1/clients/[clientId]/instagram/connect/route.ts`
- Create: `apps/web/app/api/v1/clients/[clientId]/instagram/callback/route.ts`
- Create: `apps/web/app/api/v1/clients/[clientId]/instagram/status/route.ts`

OAuth flow:

1. `/connect` — redirects to Facebook OAuth URL with `instagram_basic instagram_content_publish instagram_manage_insights pages_show_list` scopes
2. Facebook redirects to `/callback?code=...&state=clientId`
3. `/callback` — exchanges code for short-lived token → exchanges for long-lived token → stores encrypted
4. `/status` — returns `{ connected: boolean, igUsername: string | null }`

- [ ] **Step 1: Write failing test (state encoding)**

```typescript
// apps/web/app/api/v1/clients/[clientId]/instagram/__tests__/oauth.test.ts
import { describe, it, expect } from "vitest";
import { buildOAuthState, parseOAuthState } from "../connect/oauth-state";

describe("OAuth state", () => {
  it("roundtrips clientId and workspaceId", () => {
    const state = buildOAuthState("cid", "wid");
    const parsed = parseOAuthState(state);
    expect(parsed).toMatchObject({ clientId: "cid", workspaceId: "wid" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/web test`
Expected: FAIL — module not found

- [ ] **Step 3: Create OAuth state helper**

```typescript
// apps/web/app/api/v1/clients/[clientId]/instagram/connect/oauth-state.ts
export function buildOAuthState(clientId: string, workspaceId: string): string {
  return Buffer.from(JSON.stringify({ clientId, workspaceId })).toString(
    "base64url",
  );
}

export function parseOAuthState(
  state: string,
): { clientId: string; workspaceId: string } | null {
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
      clientId: string;
      workspaceId: string;
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Create connect route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/instagram/connect/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { buildOAuthState } from "./oauth-state";

const SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "instagram_manage_insights",
  "pages_show_list",
].join(",");

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const appId = process.env.IG_APP_ID!;
  const redirectUri = encodeURIComponent(
    `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/clients/${clientId}/instagram/callback`,
  );
  const state = buildOAuthState(clientId, workspaceId);

  const url = `https://www.facebook.com/v21.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&scope=${SCOPES}&state=${state}&response_type=code`;

  return NextResponse.redirect(url);
}
```

- [ ] **Step 5: Create callback route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/instagram/callback/route.ts
import { NextResponse } from "next/server";
import { db } from "@smm/db/client";
import { instagramTokens } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { encryptToken } from "@/lib/ig-crypto";
import { parseOAuthState } from "../connect/oauth-state";

async function exchangeCodeForToken(
  code: string,
  clientId: string,
  redirectUri: string,
): Promise<{ access_token: string; token_type: string }> {
  const params = new URLSearchParams({
    client_id: process.env.IG_APP_ID!,
    client_secret: process.env.IG_APP_SECRET!,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`,
  );
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json() as Promise<{ access_token: string; token_type: string }>;
}

async function getLongLivedToken(
  shortToken: string,
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: process.env.IG_APP_ID!,
    client_secret: process.env.IG_APP_SECRET!,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params.toString()}`,
  );
  if (!res.ok)
    throw new Error(`Long-lived token exchange failed: ${res.status}`);
  return res.json() as Promise<{ access_token: string; expires_in: number }>;
}

async function getIgUserId(
  accessToken: string,
): Promise<{ igUserId: string; igUsername: string }> {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?fields=instagram_business_account{id,username}&access_token=${accessToken}`,
  );
  const data = (await res.json()) as {
    data: Array<{
      instagram_business_account?: { id: string; username: string };
    }>;
  };
  const account = data.data[0]?.instagram_business_account;
  if (!account)
    throw new Error(
      "No Instagram business account found on this Facebook page.",
    );
  return { igUserId: account.id, igUsername: account.username };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const { clientId } = await params;

  if (!code || !state) {
    return NextResponse.redirect(
      new URL(`/clients/${clientId}/instagram?error=denied`, req.url),
    );
  }

  const parsed = parseOAuthState(state);
  if (!parsed || parsed.clientId !== clientId) {
    return NextResponse.redirect(
      new URL(`/clients/${clientId}/instagram?error=state_mismatch`, req.url),
    );
  }

  try {
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/clients/${clientId}/instagram/callback`;
    const shortToken = await exchangeCodeForToken(code, clientId, redirectUri);
    const longToken = await getLongLivedToken(shortToken.access_token);
    const { igUserId, igUsername } = await getIgUserId(longToken.access_token);

    const encryptedToken = encryptToken(longToken.access_token);
    const expiresAt = new Date(Date.now() + longToken.expires_in * 1000);

    await db
      .insert(instagramTokens)
      .values({
        clientId: parsed.clientId,
        workspaceId: parsed.workspaceId,
        igUserId,
        igUsername,
        encryptedToken,
        tokenType: "long_lived",
        expiresAt,
        scopes: [
          "instagram_basic",
          "instagram_content_publish",
          "instagram_manage_insights",
          "pages_show_list",
        ],
      })
      .onConflictDoUpdate({
        target: instagramTokens.clientId,
        set: {
          igUserId,
          igUsername,
          encryptedToken,
          expiresAt,
          updatedAt: new Date(),
        },
      });

    return NextResponse.redirect(
      new URL(`/clients/${clientId}/instagram?connected=1`, req.url),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.redirect(
      new URL(
        `/clients/${clientId}/instagram?error=${encodeURIComponent(msg)}`,
        req.url,
      ),
    );
  }
}
```

- [ ] **Step 6: Create status route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/instagram/status/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { instagramTokens, clients } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const [token] = await db
    .select({
      igUsername: instagramTokens.igUsername,
      expiresAt: instagramTokens.expiresAt,
    })
    .from(instagramTokens)
    .where(
      and(
        workspaceFilter(instagramTokens.workspaceId, workspaceId),
        eq(instagramTokens.clientId, clientId),
      ),
    );

  return NextResponse.json({
    connected: !!token,
    igUsername: token?.igUsername ?? null,
    expiresAt: token?.expiresAt ?? null,
  });
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @smm/web test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/web/app/api/v1/clients/
git commit -m "feat: add Instagram OAuth connect/callback/status routes"
```

---

### Task 4: Publish Route + Inngest Function

**Files:**

- Create: `apps/web/app/api/v1/clients/[clientId]/drafts/[draftId]/publish/route.ts`
- Create: `packages/inngest/src/functions/ig-publish.ts`
- Modify: `packages/inngest/src/index.ts`

The Graph API publish flow for a single image:

1. POST `/{ig-user-id}/media` with `image_url`, `caption` → returns `{ id: containerId }`
2. POST `/{ig-user-id}/media_publish` with `creation_id: containerId` → returns `{ id: igMediaId }`

- [ ] **Step 1: Write failing test**

```typescript
// packages/inngest/src/functions/__tests__/ig-publish.test.ts
import { describe, it, expect } from "vitest";
import { buildCaption } from "../ig-publish";

describe("buildCaption", () => {
  it("joins hook, caption, and hashtags", () => {
    const result = buildCaption(
      "3 signs of burnout",
      "Feeling exhausted? Here's what to know.",
      ["mentalhealth", "burnout"],
    );
    expect(result).toContain("3 signs of burnout");
    expect(result).toContain("Feeling exhausted?");
    expect(result).toContain("#mentalhealth");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/inngest test`
Expected: FAIL — module not found

- [ ] **Step 3: Create ig-publish Inngest function**

```typescript
// packages/inngest/src/functions/ig-publish.ts
import { z } from "zod";
import { inngest } from "../client";
import { db } from "@smm/db/client";
import { drafts, instagramTokens } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { decryptToken } from "../../apps/web/lib/ig-crypto"; // adjusted import path at runtime

// Note: decryptToken lives in apps/web/lib/ig-crypto.ts — extract to a shared
// package (packages/crypto or inline here) to avoid cross-app imports.
// For the plan: inline the decrypt logic here or create packages/crypto.

export function buildCaption(
  hook: string,
  caption: string,
  hashtags: string[],
): string {
  const hashtagStr =
    hashtags.length > 0 ? "\n\n" + hashtags.map((h) => `#${h}`).join(" ") : "";
  return `${hook}\n\n${caption}${hashtagStr}`;
}

async function graphPost<T>(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`https://graph.facebook.com/v21.0${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const data = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || (data as { error?: { message: string } }).error) {
    const errMsg =
      (data as { error?: { message: string } }).error?.message ??
      `Graph API error ${res.status}`;
    throw new Error(errMsg);
  }
  return data;
}

const eventSchema = z.object({
  draftId: z.string().uuid(),
  clientId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  imageUrl: z.string().url().optional(),
});

export const igPublish = inngest.createFunction(
  { id: "ig-publish", retries: 3 },
  { event: "instagram/publish" },
  async ({ event, step }) => {
    const { draftId, clientId, imageUrl } = eventSchema.parse(event.data);

    const [draft] = await step.run("fetch-draft", () =>
      db.select().from(drafts).where(eq(drafts.id, draftId)),
    );
    if (!draft) throw new Error(`Draft ${draftId} not found`);

    const [tokenRow] = await step.run("fetch-token", () =>
      db
        .select()
        .from(instagramTokens)
        .where(eq(instagramTokens.clientId, clientId)),
    );
    if (!tokenRow) throw new Error("Instagram not connected for this client");

    // Inline decrypt — see note above about extracting to shared package
    const { decryptToken: decrypt } =
      await import("../../../../apps/web/lib/ig-crypto");
    const accessToken = decrypt(tokenRow.encryptedToken);
    const igUserId = tokenRow.igUserId;

    const caption = buildCaption(draft.hook, draft.caption, draft.hashtags);

    const { id: containerId } = await step.run("create-media-container", () =>
      graphPost<{ id: string }>(`/${igUserId}/media`, accessToken, {
        image_url: imageUrl ?? "https://placeholder.invalid/1080x1080.jpg",
        caption,
      }),
    );

    const { id: igMediaId } = await step.run("publish-media", () =>
      graphPost<{ id: string }>(`/${igUserId}/media_publish`, accessToken, {
        creation_id: containerId,
      }),
    );

    await step.run("update-draft", () =>
      db
        .update(drafts)
        .set({ status: "published", igMediaId })
        .where(eq(drafts.id, draftId)),
    );

    return { ok: true, draftId, igMediaId };
  },
);
```

**Note on cross-package imports:** Before implementing, extract `encryptToken`/`decryptToken` into a new `packages/crypto/src/index.ts` so both `apps/web` and `packages/inngest` can import it without circular dependencies. Update imports in `ig-crypto.ts` to re-export from that package.

- [ ] **Step 4: Create publish API route**

```typescript
// apps/web/app/api/v1/clients/[clientId]/drafts/[draftId]/publish/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { drafts } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { inngestClient } from "@smm/inngest/client";
import { z } from "zod";

const PublishSchema = z.object({
  imageUrl: z.string().url().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, draftId } = await params;

  const [draft] = await db
    .select()
    .from(drafts)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.id, draftId),
        isNull(drafts.deletedAt),
      ),
    );
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  if (draft.status !== "approved" && draft.status !== "scheduled") {
    return NextResponse.json(
      { error: "Draft must be approved or scheduled before publishing" },
      { status: 422 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  await inngestClient.send({
    name: "instagram/publish",
    data: {
      draftId,
      clientId,
      workspaceId,
      imageUrl: parsed.data.imageUrl,
    },
  });

  return NextResponse.json({ ok: true, status: "queued" }, { status: 202 });
}
```

- [ ] **Step 5: Register igPublish in inngest index**

Add to `packages/inngest/src/index.ts`:

```typescript
export { igPublish } from "./functions/ig-publish";
```

Add `igPublish` to the Inngest serve function array in `apps/web/app/api/inngest/route.ts`.

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm --filter @smm/inngest test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/inngest/src/functions/ig-publish.ts packages/inngest/src/index.ts apps/web/app/api/v1/clients/
git commit -m "feat: add Instagram publish Inngest function and publish route"
```

---

### Task 5: Metrics Sync Inngest Cron

**Files:**

- Create: `packages/inngest/src/functions/ig-metrics-sync.ts`
- Modify: `packages/inngest/src/index.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/inngest/src/functions/__tests__/ig-metrics-sync.test.ts
import { describe, it, expect } from "vitest";
import { parseMetricsResponse } from "../ig-metrics-sync";

describe("parseMetricsResponse", () => {
  it("extracts metric values by name", () => {
    const raw = {
      data: [
        { name: "reach", values: [{ value: 150 }] },
        { name: "impressions", values: [{ value: 320 }] },
        { name: "likes", values: [{ value: 42 }] },
        { name: "comments", values: [{ value: 5 }] },
        { name: "saved", values: [{ value: 18 }] },
        { name: "shares", values: [{ value: 3 }] },
      ],
    };
    const result = parseMetricsResponse(raw);
    expect(result.reach).toBe(150);
    expect(result.impressions).toBe(320);
    expect(result.likes).toBe(42);
    expect(result.saves).toBe(18);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/inngest test`
Expected: FAIL

- [ ] **Step 3: Implement ig-metrics-sync**

```typescript
// packages/inngest/src/functions/ig-metrics-sync.ts
import { inngest } from "../client";
import { db } from "@smm/db/client";
import { drafts, instagramTokens, postMetrics } from "@smm/db/schema";
import { eq, isNotNull, and } from "drizzle-orm";

type MetricsRaw = {
  data: Array<{
    name: string;
    values: Array<{ value: number }>;
  }>;
};

export function parseMetricsResponse(raw: MetricsRaw): {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
} {
  const get = (name: string) =>
    raw.data.find((d) => d.name === name)?.values[0]?.value ?? 0;
  return {
    reach: get("reach"),
    impressions: get("impressions"),
    likes: get("likes"),
    comments: get("comments"),
    saves: get("saved"),
    shares: get("shares"),
  };
}

async function fetchMetrics(
  igMediaId: string,
  accessToken: string,
): Promise<MetricsRaw> {
  const fields = "reach,impressions,likes,comments,saved,shares";
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${igMediaId}/insights?metric=${fields}&access_token=${accessToken}`,
  );
  if (!res.ok) throw new Error(`Metrics fetch failed: ${res.status}`);
  return res.json() as Promise<MetricsRaw>;
}

export const igMetricsSync = inngest.createFunction(
  {
    id: "ig-metrics-sync",
    retries: 2,
  },
  { cron: "0 6 * * *" }, // 6 AM UTC daily
  async ({ step }) => {
    const publishedDrafts = await step.run("fetch-published-drafts", () =>
      db
        .select({
          id: drafts.id,
          clientId: drafts.clientId,
          workspaceId: drafts.workspaceId,
          igMediaId: drafts.igMediaId,
        })
        .from(drafts)
        .where(
          and(eq(drafts.status, "published"), isNotNull(drafts.igMediaId)),
        ),
    );

    if (publishedDrafts.length === 0) return { synced: 0 };

    const tokenMap = new Map<string, string>();

    for (const draft of publishedDrafts) {
      if (!draft.igMediaId) continue;

      const clientId = draft.clientId;
      if (!tokenMap.has(clientId)) {
        const [tokenRow] = await db
          .select()
          .from(instagramTokens)
          .where(eq(instagramTokens.clientId, clientId));
        if (!tokenRow) continue;

        const { decryptToken } =
          await import("../../../../apps/web/lib/ig-crypto");
        tokenMap.set(clientId, decryptToken(tokenRow.encryptedToken));
      }

      const accessToken = tokenMap.get(clientId)!;

      await step.run(`sync-metrics-${draft.id}`, async () => {
        try {
          const raw = await fetchMetrics(draft.igMediaId!, accessToken);
          const metrics = parseMetricsResponse(raw);

          await db.insert(postMetrics).values({
            draftId: draft.id,
            clientId: draft.clientId,
            workspaceId: draft.workspaceId,
            igMediaId: draft.igMediaId!,
            ...metrics,
          });
        } catch {
          // Skip drafts that fail metrics fetch — they'll retry next run
        }
      });
    }

    return { synced: publishedDrafts.length };
  },
);
```

- [ ] **Step 4: Register in inngest index**

Add to `packages/inngest/src/index.ts`:

```typescript
export { igMetricsSync } from "./functions/ig-metrics-sync";
```

Add `igMetricsSync` to the Inngest serve array.

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @smm/inngest test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/inngest/src/functions/ig-metrics-sync.ts packages/inngest/src/index.ts
git commit -m "feat: add daily Instagram metrics sync cron"
```

---

### Task 6: Instagram Connection UI

**Files:**

- Create: `apps/web/app/(app)/clients/[clientId]/instagram/page.tsx`

- [ ] **Step 1: Create the Instagram settings page**

```tsx
// apps/web/app/(app)/clients/[clientId]/instagram/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Instagram, AlertTriangle } from "lucide-react";

type ConnectionStatus = {
  connected: boolean;
  igUsername: string | null;
  expiresAt: string | null;
};

export default function InstagramPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/v1/clients/${clientId}/instagram/status`);
      if (res.ok) {
        setStatus((await res.json()) as ConnectionStatus);
      }
      setLoading(false);
    })();
  }, [clientId, connected]);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Instagram</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect this client's Instagram Business account to publish content
          directly.
        </p>
      </div>

      {connected === "1" && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Instagram connected successfully.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Connection failed: {decodeURIComponent(error)}
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Checking connection…</p>
      ) : status?.connected ? (
        <div className="rounded-md border p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-pink-500" />
            <span className="font-medium">@{status.igUsername}</span>
            <Badge className="bg-green-100 text-green-700">Connected</Badge>
          </div>
          {status.expiresAt && (
            <p className="text-xs text-muted-foreground">
              Token expires: {new Date(status.expiresAt).toLocaleDateString()}
            </p>
          )}
          <a href={`/api/v1/clients/${clientId}/instagram/connect`}>
            <Button variant="outline" size="sm">
              Reconnect
            </Button>
          </a>
        </div>
      ) : (
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            No Instagram account connected. You'll need a Facebook account with
            admin access to the client's Instagram Business account.
          </p>
          <a href={`/api/v1/clients/${clientId}/instagram/connect`}>
            <Button className="gap-2">
              <Instagram className="h-4 w-4" />
              Connect Instagram
            </Button>
          </a>
        </div>
      )}

      <div className="rounded-md border p-4 space-y-2">
        <h2 className="text-sm font-medium">Required permissions</h2>
        <ul className="text-sm text-muted-foreground space-y-1 list-disc pl-4">
          <li>instagram_basic</li>
          <li>instagram_content_publish</li>
          <li>instagram_manage_insights</li>
          <li>pages_show_list</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          The account must be an Instagram Business or Creator account linked to
          a Facebook Page.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in dev server**

Run: `pnpm --filter @smm/web dev`
Navigate to `/clients/[id]/instagram`
Verify: "Connect Instagram" button renders, OAuth redirect occurs (requires IG_APP_ID env var).

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(app)/clients/[clientId]/instagram/"
git commit -m "feat: add Instagram connection settings page"
```

---

### Manual prerequisites

- [ ] Add to `.env.example`: `IG_APP_ID`, `IG_APP_SECRET`, `INSTAGRAM_TOKEN_KEY` (32-byte hex)
- [ ] Create a Facebook Developer app with Instagram Graph API product enabled
- [ ] Submit for App Review for `instagram_content_publish` and `instagram_manage_insights` (allow 1–2 weeks)
- [ ] Create `packages/crypto/` with `encryptToken`/`decryptToken` so both `apps/web` and `packages/inngest` can import — removes the `../../../../apps/web/lib/ig-crypto` cross-package import
