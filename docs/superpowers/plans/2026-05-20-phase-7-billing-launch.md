# Phase 7: Billing + Launch Prep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Stripe subscription billing with the three existing plan tiers (starter/growth/agency), gate features by plan, add an onboarding wizard for new workspaces, and build a marketing landing page so the product can be publicly launched.

**Architecture:** A `stripe_subscriptions` table tracks per-workspace Stripe state. Webhooks update `workspaces.plan` on subscription changes. A `canUseFeature()` helper enforces plan limits in API routes. An onboarding wizard (`/setup`) runs after Clerk org creation. A `(marketing)` route group hosts the public landing page.

**Tech Stack:** Stripe Node SDK · drizzle-orm · Next.js App Router · shadcn/ui · Clerk (existing)

**Plan → feature matrix:**

| Feature             | starter | growth | agency    |
| ------------------- | ------- | ------ | --------- |
| Clients             | 1       | 5      | unlimited |
| Calendar generation | no      | yes    | yes       |
| Multi-client views  | no      | yes    | yes       |
| Meta publishing     | no      | no     | yes       |
| API access          | no      | no     | yes       |

**Stripe price IDs** (create in Stripe dashboard before Task 4):

- `price_growth_monthly` — $99/mo
- `price_agency_monthly` — $299/mo

---

## File Structure

```
packages/db/src/schema/
├── stripe.ts              NEW: stripeSubscriptions table
└── index.ts               MODIFY: export stripeSubscriptions

packages/db/migrations/
└── 0007_stripe.sql        NEW: migration SQL

packages/features/
├── package.json           NEW: @smm/features package
├── tsconfig.json
└── src/
    └── index.ts           NEW: canUseFeature(), PLAN_LIMITS

apps/web/
├── lib/
│   └── stripe.ts          NEW: Stripe client singleton
└── app/
    ├── api/
    │   ├── webhooks/stripe/route.ts     NEW: POST Stripe webhook handler
    │   └── v1/billing/
    │       ├── checkout/route.ts        NEW: POST create checkout session
    │       └── portal/route.ts          NEW: POST Stripe customer portal redirect
    ├── (app)/settings/
    │   └── billing/page.tsx             NEW: billing settings UI
    ├── (onboarding)/
    │   └── setup/
    │       └── page.tsx                 NEW: multi-step onboarding wizard
    └── (marketing)/
        └── page.tsx                     NEW: marketing landing page
```

---

### Task 1: DB Schema — stripeSubscriptions

**Files:**

- Create: `packages/db/src/schema/stripe.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/src/schema/__tests__/stripe.test.ts
import { describe, it, expect } from "vitest";

describe("stripe schema", () => {
  it("exports stripeSubscriptions", async () => {
    const mod = await import("../stripe");
    expect(mod.stripeSubscriptions).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/db test`
Expected: FAIL — module not found

- [ ] **Step 3: Create stripe schema**

```typescript
// packages/db/src/schema/stripe.ts
import { pgTable, pgEnum, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const stripeSubStatusEnum = pgEnum("stripe_sub_status", [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "unpaid",
  "incomplete",
]);

export const stripeSubscriptions = pgTable("stripe_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .unique()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id").notNull().unique(),
  stripeSubscriptionId: text("stripe_subscription_id").unique(),
  stripePriceId: text("stripe_price_id"),
  status: stripeSubStatusEnum("status").notNull().default("active"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  cancelAtPeriodEnd: text("cancel_at_period_end").default("false"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type StripeSubscription = typeof stripeSubscriptions.$inferSelect;
```

Add to `packages/db/src/schema/index.ts`:

```typescript
export * from "./stripe";
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
git add packages/db/src/schema/stripe.ts packages/db/src/schema/index.ts
git commit -m "feat: add stripe_subscriptions table"
```

---

### Task 2: Feature Gating Package

**Files:**

- Create: `packages/features/package.json`
- Create: `packages/features/tsconfig.json`
- Create: `packages/features/src/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/features/src/__tests__/index.test.ts
import { describe, it, expect } from "vitest";
import { canUseFeature, clientLimit } from "../index";

describe("canUseFeature", () => {
  it("starter cannot use calendar_generation", () => {
    expect(canUseFeature("starter", "calendar_generation")).toBe(false);
  });

  it("growth can use calendar_generation", () => {
    expect(canUseFeature("growth", "calendar_generation")).toBe(true);
  });

  it("agency can use meta_publishing", () => {
    expect(canUseFeature("agency", "meta_publishing")).toBe(true);
  });

  it("growth cannot use meta_publishing", () => {
    expect(canUseFeature("growth", "meta_publishing")).toBe(false);
  });
});

describe("clientLimit", () => {
  it("starter is capped at 1", () => {
    expect(clientLimit("starter")).toBe(1);
  });

  it("agency is unlimited (-1)", () => {
    expect(clientLimit("agency")).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/features test` (or root: `pnpm test`)
Expected: FAIL — package does not exist

- [ ] **Step 3: Create features package**

```json
// packages/features/package.json
{
  "name": "@smm/features",
  "version": "0.1.0",
  "private": true,
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^2"
  }
}
```

```json
// packages/features/tsconfig.json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  },
  "include": ["src"]
}
```

```typescript
// packages/features/src/index.ts
export type Plan = "starter" | "growth" | "agency";
export type Feature =
  | "calendar_generation"
  | "multi_client"
  | "meta_publishing"
  | "api_access"
  | "trend_digest";

const FEATURE_MATRIX: Record<Feature, Plan[]> = {
  calendar_generation: ["growth", "agency"],
  multi_client: ["growth", "agency"],
  meta_publishing: ["agency"],
  api_access: ["agency"],
  trend_digest: ["growth", "agency"],
};

const CLIENT_LIMITS: Record<Plan, number> = {
  starter: 1,
  growth: 5,
  agency: -1, // -1 = unlimited
};

export function canUseFeature(plan: Plan, feature: Feature): boolean {
  return FEATURE_MATRIX[feature].includes(plan);
}

export function clientLimit(plan: Plan): number {
  return CLIENT_LIMITS[plan];
}

export function isWithinClientLimit(plan: Plan, currentCount: number): boolean {
  const limit = clientLimit(plan);
  if (limit === -1) return true;
  return currentCount < limit;
}
```

Add `@smm/features` to `pnpm-workspace.yaml` packages list if not already covered by `packages/*`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smm/features test`
Expected: PASS

- [ ] **Step 5: Add feature gating to calendar generation route**

In `apps/web/app/api/v1/clients/[clientId]/calendar/route.ts`, add after the workspace check:

```typescript
import { canUseFeature } from "@smm/features";
import { workspaces } from "@smm/db/schema";

// Fetch workspace plan
const [workspace] = await db
  .select({ plan: workspaces.plan })
  .from(workspaces)
  .where(eq(workspaces.id, workspaceId));

if (!canUseFeature(workspace?.plan ?? "starter", "calendar_generation")) {
  return NextResponse.json(
    { error: "Calendar generation requires the Growth plan or higher." },
    { status: 403 },
  );
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/features/ apps/web/app/api/v1/clients/
git commit -m "feat: add feature gating package and enforce calendar_generation plan check"
```

---

### Task 3: Stripe Client + Webhook Handler

**Files:**

- Create: `apps/web/lib/stripe.ts`
- Create: `apps/web/app/api/webhooks/stripe/route.ts`

**Prerequisites:** `pnpm --filter @smm/web add stripe`

- [ ] **Step 1: Write failing test**

```typescript
// apps/web/lib/__tests__/stripe.test.ts
import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = "sk_test_placeholder";
});

describe("stripe client", () => {
  it("exports a stripe instance", async () => {
    const { stripe } = await import("../stripe");
    expect(stripe).toBeDefined();
    expect(typeof stripe.customers.create).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/web test`
Expected: FAIL — module not found

- [ ] **Step 3: Create Stripe client**

```typescript
// apps/web/lib/stripe.ts
import Stripe from "stripe";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not configured");
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-04-30.basil",
  typescript: true,
});

export const PRICE_IDS: Record<string, string> = {
  growth: process.env.STRIPE_PRICE_GROWTH ?? "price_growth_monthly",
  agency: process.env.STRIPE_PRICE_AGENCY ?? "price_agency_monthly",
};

export function planFromPriceId(
  priceId: string,
): "growth" | "agency" | "starter" {
  if (priceId === PRICE_IDS.growth) return "growth";
  if (priceId === PRICE_IDS.agency) return "agency";
  return "starter";
}
```

- [ ] **Step 4: Create webhook handler**

```typescript
// apps/web/app/api/webhooks/stripe/route.ts
import { NextResponse } from "next/server";
import { stripe, planFromPriceId } from "@/lib/stripe";
import { db } from "@smm/db/client";
import { stripeSubscriptions, workspaces } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const workspaceId = session.metadata?.workspaceId;
      if (!workspaceId || !session.customer || !session.subscription) break;

      const sub = await stripe.subscriptions.retrieve(
        session.subscription as string,
      );
      const priceId = sub.items.data[0]?.price.id ?? "";
      const plan = planFromPriceId(priceId);

      await db
        .insert(stripeSubscriptions)
        .values({
          workspaceId,
          stripeCustomerId: session.customer as string,
          stripeSubscriptionId: sub.id,
          stripePriceId: priceId,
          status: "active",
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
        })
        .onConflictDoUpdate({
          target: stripeSubscriptions.workspaceId,
          set: {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: sub.id,
            stripePriceId: priceId,
            status: "active",
            currentPeriodEnd: new Date(sub.current_period_end * 1000),
            updatedAt: new Date(),
          },
        });

      await db
        .update(workspaces)
        .set({ plan })
        .where(eq(workspaces.id, workspaceId));
      break;
    }

    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const priceId = sub.items.data[0]?.price.id ?? "";
      const plan = planFromPriceId(priceId);

      await db
        .update(stripeSubscriptions)
        .set({
          stripePriceId: priceId,
          status: sub.status as
            | "active"
            | "trialing"
            | "past_due"
            | "canceled"
            | "unpaid"
            | "incomplete",
          currentPeriodEnd: new Date(sub.current_period_end * 1000),
          updatedAt: new Date(),
        })
        .where(eq(stripeSubscriptions.stripeSubscriptionId, sub.id));

      const [row] = await db
        .select({ workspaceId: stripeSubscriptions.workspaceId })
        .from(stripeSubscriptions)
        .where(eq(stripeSubscriptions.stripeSubscriptionId, sub.id));

      if (row) {
        await db
          .update(workspaces)
          .set({
            plan:
              sub.status === "active" || sub.status === "trialing"
                ? plan
                : "starter",
          })
          .where(eq(workspaces.id, row.workspaceId));
      }
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const [row] = await db
        .select({ workspaceId: stripeSubscriptions.workspaceId })
        .from(stripeSubscriptions)
        .where(eq(stripeSubscriptions.stripeSubscriptionId, sub.id));

      if (row) {
        await db
          .update(stripeSubscriptions)
          .set({ status: "canceled", updatedAt: new Date() })
          .where(eq(stripeSubscriptions.stripeSubscriptionId, sub.id));
        await db
          .update(workspaces)
          .set({ plan: "starter" })
          .where(eq(workspaces.id, row.workspaceId));
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @smm/web test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/stripe.ts apps/web/app/api/webhooks/stripe/route.ts
git commit -m "feat: add Stripe client and webhook handler"
```

---

### Task 4: Checkout + Customer Portal Routes

**Files:**

- Create: `apps/web/app/api/v1/billing/checkout/route.ts`
- Create: `apps/web/app/api/v1/billing/portal/route.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/web/app/api/v1/billing/__tests__/billing.test.ts
import { describe, it, expect } from "vitest";
import { z } from "zod";

const CheckoutSchema = z.object({
  plan: z.enum(["growth", "agency"]),
});

describe("CheckoutSchema", () => {
  it("accepts valid plans", () => {
    expect(CheckoutSchema.safeParse({ plan: "growth" }).success).toBe(true);
    expect(CheckoutSchema.safeParse({ plan: "agency" }).success).toBe(true);
  });

  it("rejects starter (free plan)", () => {
    expect(CheckoutSchema.safeParse({ plan: "starter" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (trivial schema test)**

Run: `pnpm --filter @smm/web test`
Expected: PASS

- [ ] **Step 3: Create checkout route**

```typescript
// apps/web/app/api/v1/billing/checkout/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { stripe, PRICE_IDS } from "@/lib/stripe";
import { db } from "@smm/db/client";
import { stripeSubscriptions, workspaces } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const CheckoutSchema = z.object({ plan: z.enum(["growth", "agency"]) });

export async function POST(req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId, userId } = auth;

  const body = await req.json();
  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const priceId = PRICE_IDS[parsed.data.plan]!;

  // Reuse existing customer if available
  const [existing] = await db
    .select({ stripeCustomerId: stripeSubscriptions.stripeCustomerId })
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.workspaceId, workspaceId));

  const customerId = existing?.stripeCustomerId;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    ...(customerId ? { customer: customerId } : {}),
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { workspaceId },
    success_url: `${baseUrl}/settings/billing?success=1`,
    cancel_url: `${baseUrl}/settings/billing?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 4: Create Stripe customer portal route**

```typescript
// apps/web/app/api/v1/billing/portal/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { stripe } from "@/lib/stripe";
import { db } from "@smm/db/client";
import { stripeSubscriptions } from "@smm/db/schema";
import { eq } from "drizzle-orm";

export async function POST(req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const [sub] = await db
    .select({ stripeCustomerId: stripeSubscriptions.stripeCustomerId })
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.workspaceId, workspaceId));

  if (!sub) {
    return NextResponse.json(
      { error: "No active subscription found" },
      { status: 404 },
    );
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${baseUrl}/settings/billing`,
  });

  return NextResponse.json({ url: session.url });
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/v1/billing/
git commit -m "feat: add Stripe checkout and customer portal routes"
```

---

### Task 5: Billing Settings UI

**Files:**

- Create: `apps/web/app/(app)/settings/billing/page.tsx`

- [ ] **Step 1: Create billing settings page**

```tsx
// apps/web/app/(app)/settings/billing/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, CreditCard, Zap } from "lucide-react";

type BillingStatus = {
  plan: "starter" | "growth" | "agency";
  hasSubscription: boolean;
  currentPeriodEnd: string | null;
};

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["1 client", "Hook + caption generation", "Knowledge base"],
  growth: [
    "5 clients",
    "Calendar generation",
    "Trend digest",
    "Multi-client dashboard",
  ],
  agency: [
    "Unlimited clients",
    "Everything in Growth",
    "Instagram publishing",
    "API access",
  ],
};

const PLAN_PRICES: Record<string, string> = {
  starter: "Free",
  growth: "$99/mo",
  agency: "$299/mo",
};

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/v1/billing/status");
      if (res.ok) {
        setStatus((await res.json()) as BillingStatus);
      }
    })();
  }, [success]);

  async function handleUpgrade(plan: "growth" | "agency") {
    setLoading(true);
    const res = await fetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (res.ok) {
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    }
    setLoading(false);
  }

  async function handleManage() {
    setLoading(true);
    const res = await fetch("/api/v1/billing/portal", { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and plan.
        </p>
      </div>

      {success === "1" && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Subscription activated. Your plan has been updated.
          </AlertDescription>
        </Alert>
      )}
      {canceled === "1" && (
        <Alert>
          <AlertDescription>
            Checkout canceled. No charges were made.
          </AlertDescription>
        </Alert>
      )}

      {status && (
        <div className="rounded-md border p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Current plan</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="capitalize">{status.plan}</Badge>
              <span className="text-sm text-muted-foreground">
                {PLAN_PRICES[status.plan]}
              </span>
            </div>
            {status.currentPeriodEnd && (
              <p className="text-xs text-muted-foreground mt-1">
                Renews {new Date(status.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
          {status.hasSubscription && (
            <Button variant="outline" onClick={handleManage} disabled={loading}>
              <CreditCard className="mr-2 h-4 w-4" />
              Manage billing
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(["starter", "growth", "agency"] as const).map((plan) => {
          const isCurrent = status?.plan === plan;
          return (
            <div
              key={plan}
              className={`rounded-md border p-4 space-y-3 ${
                isCurrent ? "border-primary bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold capitalize">{plan}</p>
                <span className="text-sm font-medium">{PLAN_PRICES[plan]}</span>
              </div>
              <ul className="space-y-1">
                {PLAN_FEATURES[plan]!.map((f) => (
                  <li key={f} className="text-xs text-muted-foreground">
                    • {f}
                  </li>
                ))}
              </ul>
              {!isCurrent && plan !== "starter" && (
                <Button
                  className="w-full gap-2"
                  size="sm"
                  onClick={() => handleUpgrade(plan)}
                  disabled={loading}
                >
                  <Zap className="h-3 w-3" />
                  Upgrade
                </Button>
              )}
              {isCurrent && (
                <Badge variant="outline" className="w-full justify-center">
                  Current plan
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Also create the billing status route:

```typescript
// apps/web/app/api/v1/billing/status/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { workspaces, stripeSubscriptions } from "@smm/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const [workspace] = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));

  const [sub] = await db
    .select({ currentPeriodEnd: stripeSubscriptions.currentPeriodEnd })
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.workspaceId, workspaceId));

  return NextResponse.json({
    plan: workspace?.plan ?? "starter",
    hasSubscription: !!sub,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
  });
}
```

- [ ] **Step 2: Verify in dev server**

Run: `pnpm --filter @smm/web dev`
Navigate to `/settings/billing`
Verify: Plan cards render, "Upgrade" buttons visible for non-current plans, Manage billing button visible when subscription exists.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(app)/settings/billing/" apps/web/app/api/v1/billing/status/
git commit -m "feat: add billing settings page with plan upgrade UI"
```

---

### Task 6: Onboarding Wizard

**Files:**

- Create: `apps/web/app/(onboarding)/setup/page.tsx`
- Create: `apps/web/app/(onboarding)/layout.tsx`

The wizard runs 3 steps: (1) name workspace, (2) create first client, (3) create first knowledge base. After each step, the next becomes available. On completion: redirect to `/dashboard`.

- [ ] **Step 1: Create onboarding layout**

```tsx
// apps/web/app/(onboarding)/layout.tsx
import type { ReactNode } from "react";

export default function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create onboarding wizard page**

```tsx
// apps/web/app/(onboarding)/setup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle } from "lucide-react";

type Step = "workspace" | "client" | "knowledge_base" | "done";

const STEPS: Step[] = ["workspace", "client", "knowledge_base", "done"];

const STEP_LABELS: Record<Step, string> = {
  workspace: "Name your workspace",
  client: "Add your first client",
  knowledge_base: "Create a knowledge base",
  done: "You're all set",
};

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("workspace");
  const [wsName, setWsName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientSlug, setClientSlug] = useState("");
  const [kbName, setKbName] = useState("Main Knowledge Base");
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(step);

  async function handleWorkspace() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/v1/workspace/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: wsName }),
    });
    if (res.ok) {
      setStep("client");
    } else {
      const data = (await res.json()) as { error: string };
      setError(typeof data.error === "string" ? data.error : "Setup failed");
    }
    setLoading(false);
  }

  async function handleClient() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/v1/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: clientName, slug: clientSlug }),
    });
    if (res.ok) {
      const data = (await res.json()) as { client: { id: string } };
      setClientId(data.client.id);
      setStep("knowledge_base");
    } else {
      const data = (await res.json()) as { error: string };
      setError(
        typeof data.error === "string" ? data.error : "Client creation failed",
      );
    }
    setLoading(false);
  }

  async function handleKnowledgeBase() {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/v1/clients/${clientId}/knowledge-bases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: kbName }),
    });
    if (res.ok) {
      setStep("done");
    } else {
      setError("Knowledge base creation failed");
    }
    setLoading(false);
  }

  if (step === "done") {
    return (
      <div className="space-y-6 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <div>
          <h1 className="text-2xl font-semibold">You're all set!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your workspace, first client, and knowledge base are ready.
          </p>
        </div>
        <Button className="w-full" onClick={() => router.push("/dashboard")}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex gap-1 mb-4">
          {STEPS.slice(0, -1).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition ${
                i <= stepIndex - (step === "done" ? 0 : 0)
                  ? "bg-primary"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>
        <h1 className="text-xl font-semibold">{STEP_LABELS[step]}</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Step {stepIndex + 1} of {STEPS.length - 1}
        </p>
      </div>

      {step === "workspace" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="wsname">Workspace name</Label>
            <Input
              id="wsname"
              placeholder="e.g., Sunrise Therapy Practice"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            className="w-full"
            disabled={!wsName.trim() || loading}
            onClick={handleWorkspace}
          >
            {loading ? "Saving…" : "Continue"}
          </Button>
        </div>
      )}

      {step === "client" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cname">Client name</Label>
            <Input
              id="cname"
              placeholder="e.g., Dr. Sarah Chen"
              value={clientName}
              onChange={(e) => {
                setClientName(e.target.value);
                setClientSlug(
                  e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                );
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cslug">URL slug</Label>
            <Input
              id="cslug"
              value={clientSlug}
              onChange={(e) => setClientSlug(e.target.value)}
              placeholder="dr-sarah-chen"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            className="w-full"
            disabled={!clientName.trim() || !clientSlug.trim() || loading}
            onClick={handleClient}
          >
            {loading ? "Saving…" : "Continue"}
          </Button>
        </div>
      )}

      {step === "knowledge_base" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A knowledge base stores documents and content your client has shared
            — used to ground generated content in their voice.
          </p>
          <div className="space-y-1">
            <Label htmlFor="kbname">Knowledge base name</Label>
            <Input
              id="kbname"
              value={kbName}
              onChange={(e) => setKbName(e.target.value)}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            className="w-full"
            disabled={!kbName.trim() || loading}
            onClick={handleKnowledgeBase}
          >
            {loading ? "Creating…" : "Finish setup"}
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add workspace setup route**

```typescript
// apps/web/app/api/v1/workspace/setup/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { workspaces } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const SetupSchema = z.object({ name: z.string().min(1).max(100) });

export async function POST(req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const body = await req.json();
  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  await db
    .update(workspaces)
    .set({ name: parsed.data.name })
    .where(eq(workspaces.id, workspaceId));

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Verify in dev server**

Run: `pnpm --filter @smm/web dev`
Navigate to `/setup`
Verify: Step 1 renders, completing each step advances to the next, completion redirects to `/dashboard`.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(onboarding)/" apps/web/app/api/v1/workspace/
git commit -m "feat: add multi-step onboarding wizard"
```

---

### Task 7: Marketing Landing Page

**Files:**

- Create: `apps/web/app/(marketing)/layout.tsx`
- Create: `apps/web/app/(marketing)/page.tsx`

- [ ] **Step 1: Create marketing layout**

```tsx
// apps/web/app/(marketing)/layout.tsx
import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" className="font-semibold text-lg">
          TherapyContent
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
        © 2026 TherapyContent. Built for licensed mental health professionals.
      </footer>
    </div>
  );
}
```

- [ ] **Step 2: Create landing page**

```tsx
// apps/web/app/(marketing)/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Shield, Instagram, TrendingUp } from "lucide-react";

const FEATURES = [
  {
    icon: Zap,
    title: "AI-powered content",
    description:
      "Generate 15 hooks and full captions in seconds — grounded in your client's knowledge base.",
  },
  {
    icon: Shield,
    title: "Compliance built in",
    description:
      "Every piece of content is checked against your state's licensure rules before you see it.",
  },
  {
    icon: Instagram,
    title: "Publish directly",
    description:
      "Approved drafts go live on Instagram with one click. No copy-paste.",
  },
  {
    icon: TrendingUp,
    title: "Weekly trending topics",
    description:
      "Surface what's being discussed in mental health communities every Monday morning.",
  },
];

const PRICING = [
  {
    plan: "Starter",
    price: "Free",
    description: "Try it with one client",
    features: ["1 client", "Hook + caption generation", "Compliance checker"],
    cta: "Start free",
    href: "/sign-up",
    highlight: false,
  },
  {
    plan: "Growth",
    price: "$99/mo",
    description: "For active SMM practices",
    features: [
      "5 clients",
      "Calendar generation",
      "Client approval portal",
      "Weekly trend digest",
    ],
    cta: "Start Growth",
    href: "/sign-up?plan=growth",
    highlight: true,
  },
  {
    plan: "Agency",
    price: "$299/mo",
    description: "For full-service agencies",
    features: [
      "Unlimited clients",
      "Instagram publishing",
      "API access",
      "Priority support",
    ],
    cta: "Start Agency",
    href: "/sign-up?plan=agency",
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <div>
      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 py-24 text-center space-y-6">
        <Badge className="text-sm">Built for therapist SMMs</Badge>
        <h1 className="text-5xl font-bold tracking-tight leading-tight">
          Compliant Instagram content
          <br />
          for mental health practices
        </h1>
        <p className="text-xl text-muted-foreground max-w-xl mx-auto">
          Generate, review, and publish therapy-informed social media content
          that never violates your state's licensure rules.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Zap className="h-4 w-4" />
              Start free
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-semibold text-center mb-10">
          Everything a therapy SMM needs
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-md border p-5 space-y-2">
              <div className="flex items-center gap-2">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="font-medium">{f.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-semibold text-center mb-10">
          Simple pricing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {PRICING.map((p) => (
            <div
              key={p.plan}
              className={`rounded-md border p-5 space-y-4 ${
                p.highlight ? "border-primary shadow-md" : ""
              }`}
            >
              {p.highlight && <Badge className="text-xs">Most popular</Badge>}
              <div>
                <h3 className="font-semibold text-lg">{p.plan}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold">{p.price}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {p.description}
                </p>
              </div>
              <ul className="space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="text-sm text-muted-foreground">
                    ✓ {f}
                  </li>
                ))}
              </ul>
              <Link href={p.href}>
                <Button
                  className="w-full"
                  variant={p.highlight ? "default" : "outline"}
                >
                  {p.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Verify in dev server**

Run: `pnpm --filter @smm/web dev`
Navigate to `/` — verify landing page renders with hero, features grid, pricing cards.
Check all "Get started" / "Sign in" links navigate correctly.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(marketing)/"
git commit -m "feat: add marketing landing page"
```

---

### Manual prerequisites

- [ ] Add to `.env.example`: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_AGENCY`
- [ ] Install Stripe SDK: `pnpm --filter @smm/web add stripe`
- [ ] Create Stripe products + prices in the Stripe dashboard
- [ ] Configure Stripe webhook endpoint to `https://yourdomain.com/api/webhooks/stripe` for events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
- [ ] Add `@smm/features` to `apps/web/package.json` dependencies: `"@smm/features": "workspace:*"`
- [ ] Update `Next.js` Clerk redirect — after sign-up, redirect to `/setup` instead of `/dashboard` for new orgs
- [ ] Replace "TherapyContent" brand name throughout marketing page with the actual product name
