# Post-Implementation Setup Runbook

> **Date:** 2026-05-21
> **Author:** Claude Code (review before following)
> **Estimated time:** 60–90 minutes
> **Risk level:** Medium (external service configuration; no steps affect existing data)

## Context

Phases 4–7 and the Scraper CLI have been implemented and committed across four
feature branches. The automated work added five new schema migrations, Stripe
billing, Instagram OAuth, the client portal (magic-link auth), weekly trend
sync, and the Playwright scraper CLI. None of these features are live until the
external services are configured and the environment variables are populated.
This runbook covers every step that cannot be scripted.

---

## Prerequisites

Before starting, confirm:

- [ ] You have access to the Neon Postgres database dashboard (or a `DATABASE_URL` with migration privileges)
- [ ] You have a Resend account and can create API keys
- [ ] You have a Stripe account (test mode is fine to start) and dashboard access
- [ ] You have a Meta developer account and can create a Facebook App
- [ ] You have a Clerk dashboard for this application
- [ ] All four feature branches have been merged to `main` (or you are running from a branch that includes all migrations)
- [ ] The app is deployed (or you can run `pnpm dev` locally for verification)

---

## Section 1 — Environment Variables

### 1. Create `.env.local` in `apps/web/`

**Where:** Project root terminal

All secrets go in `apps/web/.env.local` (gitignored). Never commit real values.
Copy the template below and fill in each placeholder before proceeding to the
service-specific steps.

```bash
# apps/web/.env.local

# ── Clerk ─────────────────────────────────────────────────
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<from Clerk dashboard>
CLERK_SECRET_KEY=<from Clerk dashboard>
CLERK_WEBHOOK_SECRET=<from Clerk dashboard — see Section 5>

# ── Neon / Postgres ───────────────────────────────────────
DATABASE_URL=<from Neon dashboard — use the pooled connection string>

# ── Anthropic ─────────────────────────────────────────────
ANTHROPIC_API_KEY=<from console.anthropic.com>

# ── Inngest ───────────────────────────────────────────────
INNGEST_EVENT_KEY=<from Inngest dashboard>
INNGEST_SIGNING_KEY=<from Inngest dashboard>

# ── Resend (client portal magic links) ────────────────────
RESEND_API_KEY=<from resend.com/api-keys>

# ── Portal auth (32-byte random hex) ─────────────────────
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
PORTAL_SECRET=<64-char hex string>

# ── Instagram / Meta OAuth ────────────────────────────────
IG_APP_ID=<Facebook App ID — see Section 4>
IG_APP_SECRET=<Facebook App Secret — see Section 4>
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
INSTAGRAM_TOKEN_KEY=<64-char hex string>

# ── Stripe ────────────────────────────────────────────────
STRIPE_SECRET_KEY=<from Stripe dashboard — sk_test_... or sk_live_...>
STRIPE_WEBHOOK_SECRET=<from Stripe dashboard — see Section 3>
STRIPE_PRICE_GROWTH=<price_... ID from Stripe — see Section 3>
STRIPE_PRICE_AGENCY=<price_... ID from Stripe — see Section 3>

# ── App URL ───────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://yourdomain.com
# Local dev: NEXT_PUBLIC_APP_URL=http://localhost:3000

# ── Sentry (optional — skip if not using error tracking) ──
NEXT_PUBLIC_SENTRY_DSN=<from sentry.io>
SENTRY_ORG=<your Sentry org slug>
SENTRY_PROJECT=<your Sentry project slug>
```

**Expected result:** File saved. Running `pnpm dev` in `apps/web/` starts without
`Error: ... is not configured` crashes.

---

## Section 2 — Database Migrations

### 2. Run all pending migrations

**Where:** Project root terminal — requires `DATABASE_URL` to be set in your shell
or in `packages/db/.env.local`

Five new migrations were added across Phases 4–7. Run them in order:

```bash
# Export your database URL so drizzle-kit can connect
export DATABASE_URL="<your Neon connection string>"

pnpm --filter @smm/db migrate
```

The command applies all unapplied migrations in `packages/db/migrations/`
sequentially. You should see output confirming each file was applied.

**Expected result:** All six migrations run without error:

```
0002_curved_captain_midlands.sql  ✓
0003_sweet_nebula.sql              ✓  (instagram_tokens, post_metrics)
0004_sleepy_mulholland_black.sql   ✓  (trend_topics)
0005_acoustic_toro.sql             ✓  (stripe_subscriptions)
```

> **Note:** If you get a "relation already exists" error, a previous partial
> migration left the schema in a dirty state. Check `drizzle.__drizzle_migrations`
> in your database and remove the failed entry before re-running.

---

## Section 3 — Stripe Setup

### 3a. Create products and prices in Stripe

**Where:** [dashboard.stripe.com](https://dashboard.stripe.com) → **Product catalog** → **+ Add product**

Create two products:

**Product 1 — Growth**

- Name: `Growth`
- Pricing model: Recurring
- Price: `$99.00 USD / month`
- Click **Save product**
- Copy the **Price ID** that starts with `price_` — this is `STRIPE_PRICE_GROWTH`

**Product 2 — Agency**

- Name: `Agency`
- Pricing model: Recurring
- Price: `$299.00 USD / month`
- Click **Save product**
- Copy the **Price ID** — this is `STRIPE_PRICE_AGENCY`

Add both price IDs to `apps/web/.env.local`.

**Expected result:** Both products visible in Stripe dashboard with their price IDs copied.

---

### 3b. Register the Stripe webhook endpoint

**Where:** [dashboard.stripe.com](https://dashboard.stripe.com) → **Developers** → **Webhooks** → **+ Add endpoint**

Fill in the form:

- **Endpoint URL:** `https://yourdomain.com/api/webhooks/stripe`
  - Local dev: use [Stripe CLI](https://stripe.com/docs/stripe-cli) (`stripe listen --forward-to localhost:3000/api/webhooks/stripe`) instead of this step
- **Select events to listen to:** check these three:
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
- Click **Add endpoint**

After saving, click **Reveal** next to **Signing secret** and copy the value starting with `whsec_`. This is `STRIPE_WEBHOOK_SECRET`.

Add it to `apps/web/.env.local`.

**Expected result:** Endpoint listed in Stripe Webhooks with status **Enabled**.

---

### 3c. (Local dev only) Run the Stripe CLI listener

**Where:** Terminal — requires [Stripe CLI](https://stripe.com/docs/stripe-cli) installed and `stripe login` completed

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

Copy the **webhook signing secret** printed on startup (`whsec_...`) and set it
as `STRIPE_WEBHOOK_SECRET` in your local `.env.local`.

**Expected result:** CLI prints `Ready! Waiting for events...`

---

## Section 4 — Meta / Instagram OAuth

### 4a. Create a Facebook App

**Where:** [developers.facebook.com](https://developers.facebook.com) → **My Apps** → **Create App**

- App type: **Business**
- App name: choose your product name
- Contact email: your email
- Click **Create app**

After creation:

- Go to **App settings → Basic**
- Copy **App ID** → `IG_APP_ID`
- Copy **App secret** → `IG_APP_SECRET`

Add both to `apps/web/.env.local`.

**Expected result:** App created, credentials copied.

---

### 4b. Add Instagram Graph API product

**Where:** Facebook App dashboard → **Add a product** → find **Instagram** → **Set up**

- Add the **Instagram** product to your app
- Under **Instagram → API setup with Instagram login**, add your app's OAuth
  redirect URI:
  ```
  https://yourdomain.com/api/v1/clients/{clientId}/instagram/callback
  ```

  - Replace `{clientId}` with a wildcard or note that each client gets its own
    callback path. Use a fixed test client ID for the sandbox entry.

**Expected result:** Instagram product added, redirect URI saved.

---

### 4c. Submit for Meta App Review (production only)

**Where:** Facebook App dashboard → **App Review** → **Requests**

The following permissions require Meta review before use in production with
real user accounts:

| Permission                  | Why needed                    |
| --------------------------- | ----------------------------- |
| `instagram_basic`           | Read account info and media   |
| `instagram_content_publish` | Publish to Instagram feed     |
| `instagram_manage_insights` | Read post engagement metrics  |
| `pages_show_list`           | List connected Facebook Pages |

> **Warning:** App Review typically takes **1–2 weeks**. Until approved, the
> integration only works for accounts listed as **Testers** in your app's
> **Roles** section. Add client Instagram accounts as Testers now so you can
> test end-to-end before review completes.

**Expected result:** Review request submitted. Test accounts added under **Roles → Testers**.

---

## Section 5 — Clerk Webhook

### 5. Register the Clerk webhook

**Where:** [dashboard.clerk.com](https://dashboard.clerk.com) → your application → **Webhooks** → **+ Add Endpoint**

- **Endpoint URL:** `https://yourdomain.com/api/webhooks/clerk`
- **Subscribe to events:** `organization.created`, `user.created`
- Click **Create**

After saving, click **Signing Secret** and copy the value. This is
`CLERK_WEBHOOK_SECRET`.

Add it to `apps/web/.env.local`.

**Expected result:** Webhook endpoint listed and active in Clerk dashboard.

---

## Section 6 — Onboarding Redirect

### 6. Configure Clerk to redirect new sign-ups to `/setup`

**Where:** `apps/web/proxy.ts` — open in your editor

The onboarding wizard lives at `/setup`. New workspaces created via Clerk
should land there instead of `/dashboard`. Update the after-sign-up redirect:

```typescript
// apps/web/proxy.ts — update clerkMiddleware callback
export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect({
      unauthenticatedUrl: "/sign-in",
    });
  }
});
```

Then in your Clerk dashboard (**Configure → Paths**):

- **Sign-up redirect URL:** `/setup`
- **Sign-in redirect URL:** `/dashboard`

**Expected result:** After signing up and creating an org, users land on `/setup`
instead of `/dashboard`.

---

## Section 7 — Resend Sender Domain

### 7. Add and verify your sending domain in Resend

**Where:** [resend.com/domains](https://resend.com/domains) → **+ Add Domain**

The portal magic-link email sends from `noreply@yourdomain.com`
(hardcoded in `apps/web/lib/email.ts`). Update that address AND verify the
domain:

1. In Resend: add your domain and follow the DNS record instructions (DKIM, SPF)
2. In `apps/web/lib/email.ts`, update line 7:
   ```typescript
   from: "noreply@yourdomain.com",   // ← replace with your verified domain
   ```
3. Save the API key to `RESEND_API_KEY` in `.env.local`

> **Note:** While DNS propagates (up to 48 hours), you can use Resend's default
> `onboarding@resend.dev` sender for testing — no domain verification needed.

**Expected result:** Resend dashboard shows domain **Verified**. Sending a
test email via the Resend dashboard succeeds.

---

## Section 8 — Branding

### 8. Replace placeholder brand name in marketing page

**Where:** `apps/web/app/(marketing)/layout.tsx` and `apps/web/app/(marketing)/page.tsx`

The marketing landing page uses the placeholder name **"TherapyContent"** in
several places. Search and replace with your actual product name:

```bash
# Preview all occurrences
grep -rn "TherapyContent" apps/web/app/\(marketing\)/
```

Update each occurrence in:

- `layout.tsx` — nav logo text and footer copyright line
- `page.tsx` — `<Badge>` copy, meta description if added later

**Expected result:** `grep -r "TherapyContent" apps/web/` returns no results.

---

## Section 9 — Generate Secrets Locally

### 9. Generate `PORTAL_SECRET` and `INSTAGRAM_TOKEN_KEY`

**Where:** Any terminal with Node.js

Both secrets must be 64-character hex strings (32 bytes). Generate them:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Run this command **twice** — once for `PORTAL_SECRET`, once for
`INSTAGRAM_TOKEN_KEY`. Use different values for each.

> **Warning:** These keys encrypt data at rest. If you rotate them after
> users have saved portal sessions or connected Instagram accounts, all
> existing encrypted data becomes unreadable. Store them in your secrets
> manager (e.g., Vercel Environment Variables, AWS Secrets Manager) and
> never rotate without a migration plan.

**Expected result:** Two unique 64-character hex strings added to `.env.local`.

---

## Verification

After completing all steps, verify end-to-end:

- [ ] `pnpm dev` starts with no `Error: ... is not configured` messages in the console
- [ ] Navigate to `/` — marketing landing page renders with your brand name
- [ ] Navigate to `/sign-up` → complete Clerk sign-up → redirected to `/setup`
- [ ] Complete the onboarding wizard → redirected to `/dashboard`
- [ ] Navigate to `/settings/billing` — plan cards render, current plan shows "starter"
- [ ] Click **Upgrade → Growth** — Stripe Checkout opens (test mode: use card `4242 4242 4242 4242`)
- [ ] After checkout → returns to `/settings/billing?success=1` — plan updates to "growth"
- [ ] Create a client, navigate to `/clients/[id]/instagram` — **Connect Instagram** link redirects to Facebook OAuth
- [ ] Navigate to `/trends` — shows "No trends yet" message (sync runs Monday 8 AM UTC)
- [ ] Send a magic-link from `/portal/[client-slug]` — email arrives via Resend
- [ ] Click the magic link → lands on the portal draft review page

## Rollback

All steps in this runbook are non-destructive and can be re-run safely with
the following exceptions:

- **Database migrations** — cannot be automatically reversed. If a migration
  causes issues, manually drop the new table(s) and remove the corresponding
  row from `drizzle.__drizzle_migrations` before re-running.
- **Stripe products** — deleting a price ID that has been used in a subscription
  will break existing subscriptions. Archive rather than delete.
- **Meta App Review submission** — once submitted it cannot be unsubmitted.
  Only submit when the integration is production-ready.

## Notes & Gotchas

- `PORTAL_SECRET` and `INSTAGRAM_TOKEN_KEY` must each be **exactly 64 hex characters** (32 bytes). The app throws at startup if they are shorter.
- Stripe test mode price IDs (`price_...`) only work with test mode secret keys (`sk_test_...`). Swap both when going live.
- Resend's free tier sends from `onboarding@resend.dev` — clients will see an unfamiliar sender. Verify your domain before sending to real clients.
- Instagram's long-lived tokens expire after **60 days**. The `ig-metrics-sync` Inngest function refreshes them, but you must ensure the function is registered and Inngest is connected to your deployment.
- The Clerk webhook secret (`CLERK_WEBHOOK_SECRET`) is different from the Clerk secret key (`CLERK_SECRET_KEY`). Both are required.
- For local Stripe webhook testing, the `stripe listen` CLI must be running **before** you attempt a checkout — the webhook fires synchronously as part of the Checkout flow.
