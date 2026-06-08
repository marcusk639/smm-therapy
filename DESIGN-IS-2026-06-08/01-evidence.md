# 01 — Evidence (consolidated)

Source-inferred audit. Visual / perf / a11y items are **INFERRED** from source (no running instance). Every finding below carries a `file:line` or measured/estimated value. Five evidence subagents; orchestrator consolidated and rejected any uncited claim.

---

## A. Structural (interactivity, IA, duplication, dead code)

**Interactive-element counts (declared):** ~46 distinct interactive declarations across the surface; runtime higher on `.map` screens (hooks renders 15 checkboxes + 15 labels `generate/hooks/page.tsx:215-227`; captions renders 5 textareas + 5 buttons `generate/captions/page.tsx:165-220`). Several screens render **zero** task affordances: `dashboard/page.tsx:6-12`, `clients/page.tsx:3-9`, `trends/page.tsx:42-85`.

**Max nesting depth ≈ 8–9** on densest screens: `calendar/page.tsx:178-206` (day-cell grid, depth ≈9), `drafts/[draftId]/page.tsx:157-171` (Select block, ≈8), `generate/hooks/page.tsx:145-194` (crisis/violations, ≈8).

**Routing / IA (load-bearing):**

- `clients/[clientId]/page.tsx` **does not exist** → `/clients/{id}` resolves to **404** (no `not-found.tsx` in `(app)`).
- `clients/[clientId]/drafts/page.tsx` **does not exist** → `/clients/{id}/drafts` resolves to **404** (only `drafts/[draftId]` exists).
- `clients/page.tsx:5-7` is a **static stub**: "No clients yet. Phase 1 will add client creation UI." **No link** anywhere from `/clients` to any per-client route.
- Per-client work screens (calendar, drafts, knowledge, brand-voice, instagram, repurpose, generate) have **no sidebar nav entry** (`app-sidebar.tsx:9-14` = Dashboard/Clients/Trends/Billing only) and **no inbound links** → reachable **only by typing the URL**.
- **Broken import:** `drafts/[draftId]/page.tsx:9-15` imports `@/components/ui/select`, which **does not exist** in `components/ui/` (11 files; no `select.tsx`). `repurpose/page.tsx:163-174` uses a raw native `<select>` instead.

**Repeated patterns (not componentized):**

- Generate CTA (Zap icon + loading-label swap) hand-rolled 3×: `generate/hooks/page.tsx:122-129`, `calendar/page.tsx:141-152`, `settings/billing/page.tsx:149-157`.
- Two divergent format-dropdown implementations for the same action: shadcn `Select` `drafts/[draftId]/page.tsx:193-213` vs native `<select>` `repurpose/page.tsx:163-184`.
- `STATUS_COLORS` maps duplicated/divergent 3–4×: `calendar/page.tsx:19-27` (7 keys), `knowledge/page.tsx:33-42` (8 keys), `repurpose/page.tsx:32-35` (2 keys), inline ternary `drafts/[draftId]/page.tsx:130-131`.
- `FORMATS` array redeclared 3×: `captions:87-93`, `drafts/[draftId]:41-47`, `repurpose:24-30`.
- `Violation` type redeclared 3×: `captions:19-25`, `hooks:15-21`, `compliance-badge.tsx:4-10`.
- Hand-rolled `<p>Loading…</p>` empty/loading state ≥5×: `calendar`, `repurpose:129`, `knowledge:191`, `drafts/[draftId]:116`, `instagram:64` (Skeleton used in only 2 files).

**Dead/loose:** `trends/page.tsx:6` unused type import; `drafts/[draftId]` typed fields `hashtags`/`format`/`scheduledAt` fetched but never rendered; `knowledge` `Document.createdAt` typed, unrendered; `components/ui/separator.tsx` + `avatar.tsx` imported by no audited screen. (Manual read, not a compiler sweep — floor not ceiling.)

**Removable user-facing extras:** "⚡ Cache hit" `hooks:172-176`; truncated job UUID `calendar:154-158`; raw OAuth scope list `instagram:98-110`; checkmark glyph in button label `captions:217`; data-export section on Billing `settings/billing/page.tsx:169-179`; double current-plan indication `billing:107` + `:160`.

---

## B. Visual — INFERRED (tokens, scale, states, consistency)

Tokens are **HSL triples** in `globals.css` (not oklch); contrast is computable. No `tailwind.config`; `@theme inline` `globals.css:50-71` is the only theme source.

- **Spacing scale:** clean 4px grid `{2,4,6,8,12,16,24,32}px` (Tailwind defaults; no custom `--spacing-*`).
- **Type scale:** `{12,14,16,18,24}px` — 14px-dominant body, single 24px `<h1>`, only 2 weights (`font-medium`, `font-semibold`). Disciplined.
- **Color tokens:** 19 semantic tokens defined (light+dark); ~13 referenced. `popover`/`popover-foreground` defined but **unreferenced** (orphan, `globals.css:9-10,32-33`). **Plus a large off-token palette** (~9 raw Tailwind families gray/blue/yellow/green/red/purple/emerald/amber at `*-50/100/500/600/700/800`) injected directly in status maps — a second, uncoordinated, light-mode-only palette.
- **Lowest contrast (INFERRED, computed):** `muted-foreground` on `background` ≈ **4.4:1 light** — borderline, **likely fails AA 4.5:1 normal text** (`globals.css:16,4`); `destructive` text on white ≈ 3.9:1 borderline (`alert.tsx:13`). Off-token badge pairs (amber-600/amber-50, _-700/_-100) uncomputed — flag for rendered check.
- **States checklist (worst instances):** generate flows (hooks/captions/brand-voice) have loading+error+disabled+validation — strong. **dashboard & clients are static stubs with no data states.** **billing swallows fetch errors** (`if (res.ok)` only, `settings/billing/page.tsx:49,60,69`) — no error UI, no status zero-state. Sidebar nav `<Link>` has **no focus-visible ring** (`app-sidebar.tsx:34-39`) while primitives do (`button.tsx:8`, `input.tsx:13`).
- **System breaks:** no inline styles, no raw hex (good). But: radius inconsistency — Card `rounded-xl` (`card.tsx`) vs hand-rolled `rounded-lg` (`trends:69`) / `rounded-md` (`billing:103,131`); `Alert` primitive has only `default`+`destructive` variants → **5+ hardcoded green/amber blocks** (`billing:87-89`, `instagram:46-48`, `hooks:148-150`, `compliance-badge.tsx:24`); ad-hoc `<h1 text-2xl font-semibold>` copy-pasted per page (no PageHeader).

---

## C. Copy & Honesty

- **Inflation (1 notable):** "Generate a full month of posts in one click." `calendar/page.tsx:106-108` — not one click (form input required) and async/queued (`jobId … queued`, `:155-157`), not instant. ("⚡ Cache hit" `hooks:172-176` is informational, borderline.)
- **Dark patterns: none found.** Cancel path explicit ("Checkout canceled. No charges were made." `billing:96-99`); "Manage billing" → Stripe portal (`:67-74`); no pre-checked opt-ins; no fake scarcity/confirmshaming; prices + renewal disclosed (`billing:32-36,112-114`).
- **Jargon / unclear labels:** "Trend Digest" (`trends:45`), "Repurpose" (`repurpose:120`), "Knowledge Base" (`knowledge:121`), "RAG-powered generation" (`knowledge:123`), "Hooks" (`hooks:104`), "CTA" (`captions:48`), "Disclosure" badge (`brand-voice:116`), raw status enums "ready_for_client"/"changes_requested" (`calendar:19-27`, `drafts:164`), raw OAuth scopes `instagram:101-104`, truncated job UUID `calendar:155-157`.
- **Label→behavior:** mostly honest (Save Draft, Save changes, Repurpose all verified to match handlers). **One mismatch:** calendar "Generate … in one click" / synchronous-sounding "Generate" vs async background job (`label :106/:151` vs `handler :62-91`). Instagram/export server routes unverified (out of file scope).

---

## D. Weight & Friction — estimated (no build/instance)

- **Initial JS (est.):** ~**300–500 KB gzip** for an operator route, dominated by **React 19 + @clerk/nextjs** (ClerkProvider app-wide + sidebar widgets). App's own UI code is thin. Heaviest dep `@react-pdf/renderer` is **server-only** (reports route); Stripe/Resend/Svix server-only. Method: dep enumeration + 13 `"use client"` boundaries. No charting/animation/editor/datepicker/carousel in client bundle (greps empty).
- **Requests for primary view (est.):** clients list = **0** (stub); busiest workspace (Knowledge) = **3–4** with a **dependent waterfall** (`fetchKbs` must set `selectedKbId` before `fetchDocs`, `knowledge:71-73,82`).
- **TTI (est.):** **low–medium.** Shell + clients list are Server Components; but every data screen is a full `"use client"` page fetching **after hydration** (skeleton-then-content), not server-streamed.
- **Idle animations: 0.** `animate-spin`/`animate-pulse` are loading-only; `transition-colors` hover-only. No framer-motion/keyframes/autoplay/marquee.
- **Attention-demanding elements on load: 0.** No auto modals/toasts; all `<Alert>` conditional; no count badges; sidebar has no notification counters.
- **Resource respect:** dark `.dark` token set **authored but inert** — class-based only, **no `prefers-color-scheme`, no toggle / next-themes** → dark mode never activates (`globals.css:27-47`). **`prefers-reduced-motion` not respected** anywhere. Icons per-glyph (tree-shakeable).

---

## E. Accessibility — INFERRED

- **Contrast:** `foreground`/`primary`/`secondary`/`accent`/`card` pairs PASS; **`muted-foreground` on `background` ~4.5:1 borderline**, on `muted` **likely fails**; `destructive` ~3.9:1 borderline. Portal user-supplied `primaryColor` unknowable. (`globals.css` values; needs rendered axe.)
- **Focus order:** logical; **no positive tabindex** anywhere; no `tabindex=-1` on interactive elements.
- **Keyboard reachability:** **every primary action is a real `<button>`/`<a>`/native input** — **zero `div/span onClick`** repo-wide. (Open-client action N/A — doesn't exist.)
- **Landmarks: 3** (`main` `layout.tsx:7`, `aside` `app-sidebar.tsx:20`, `nav` `:29`); **no `<header>`/`<footer>`** in operator shell.
- **Skip-link: none** (zero `sr-only`/skip hits) → keyboard users tab through full sidebar before `<main>` on every page.
- **Focus rings:** present on button/input/textarea/checkbox (`ring-1 ring-ring`, thin); **sidebar nav `<Link>` has none** (`app-sidebar.tsx:34-39`).
- **Labels:** most forms associate `htmlFor`/`id` correctly; **drafts editor has 3 orphaned `<Label>`s** (no `htmlFor`/`id`, `drafts:140,149,158`); **captions `<Textarea>` has no label/aria-label** (`captions:181`).
- One `<img>` (portal logo) has alt; no icon-only buttons in operator screens. Clerk/Radix internals need rendered check.

---

## F. Cross-confirmed facts (multiple subagents)

1. **Primary task is unreachable in the UI** — clients stub + missing client-root/drafts-list pages + no nav/links to per-client screens (Structural A, A11y E "open-client N/A").
2. **Broken `select.tsx` import** on the draft editor (Structural A; Visual notes Select primitive absent).
3. **dashboard + clients are static stubs** with no real states (Structural, Visual).
4. **4 duplicated/divergent status-color maps, off-token, light-mode-only** (Structural C, Visual B).
5. **Dark mode authored but inert** (Weight D, Visual notes light-only badges).
6. **No skip-link, sidebar nav lacks focus ring** (A11y E, Visual B).

## G. Known gaps (need rendered instance)

Exact contrast ratios; dark-mode badge legibility; real bundle bytes / TTI ms / request timing; Clerk + Radix internal a11y; focus-ring visibility at 1px; whether Phase-1 replaces the dashboard/clients stubs with real UI.
