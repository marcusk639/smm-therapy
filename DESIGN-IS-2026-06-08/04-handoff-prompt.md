# 04 — /make-plan Handoff

Copy-paste the fenced prompt below into a new session. It is self-contained — it quotes the verdict and moves so the next session needs no access to this audit.

```
/make-plan Redesign the smm-therapy SMM-operator surface (clients management + content workspace). Current design failed a Dieter Rams audit at 14/30 with critical gaps in principles #2 (Useful, scored 0), #3 (Aesthetic, 1), #4 (Understandable, 1), #8 (Thorough, 1), and #10 (As little design as possible, 1).

Verdict paragraph (quoted from the audit):
> The SMM-operator surface scores 14/30 with #2 (Useful) at 0 — the primary task of managing clients and routing content is unreachable through the UI, so the navigation/IA spine must be rebuilt from purpose while preserving the genuinely strong token system and compliance-aware generate flows.

Why redesign and not refine: A load-bearing principle (#2 Useful) scored 0 AND total (14) is below the 20 threshold — either alone forces a redesign. The failure is structural: an operator cannot open a client at all (clients list is a static stub; the client-root and drafts-list routes 404; per-client screens have no navigation or inbound links), so restyling cannot fix it.

Primary user: SMM operator (agency user managing therapist clients and producing Instagram content).
Primary task: navigate clients → open a client → manage content (generate hooks/captions, drafts, calendar, knowledge, brand voice, Instagram, repurpose) → hand off for review.

Preserve from current design (keep — these scored well or are load-bearing assets):
- The HSL design-token system in apps/web/app/globals.css (19 semantic tokens, 4px spacing grid {2,4,8,12,16,24,32}, 5-size type scale {12,14,16,18,24}, 2 weights). Disciplined; keep as the single source of truth.
- The shadcn UI primitive library in apps/web/components/ui/* (button, input, textarea, checkbox, card, badge, alert, label, skeleton) — focus rings and disabled styles already present.
- The generate flows: apps/web/app/(app)/clients/[clientId]/generate/{hooks,captions}/page.tsx and brand-voice/page.tsx — they have complete loading/error/disabled/validation states. Keep their structure.
- The compliance UX: in-line violation lists, crisis-resource appending, and KB citations (generate/hooks/page.tsx:151-158,183-201; components/compliance-badge.tsx). This is the product's differentiator (principle #1 innovative scored 2 because of it).
- Honest billing flow: explicit cancel copy + Stripe portal path (settings/billing/page.tsx:67-74,96-99) — keep the honesty (#6 scored 2).

Discard (these structural patterns caused the failures):
- The static clients stub (apps/web/app/(app)/clients/page.tsx:5-7, "No clients yet. Phase 1 will add client creation UI."). Caused #2 = 0 — no entry point to the task.
- URL-only routing to per-client tools (app-sidebar.tsx:9-14 lists only Dashboard/Clients/Trends/Billing; no per-client nav or links). Caused #2 = 0 and hurt #4.
- The 4 duplicated, off-token, light-mode-only STATUS_COLORS maps (calendar/page.tsx:19-27, knowledge/page.tsx:33-42, repurpose/page.tsx:32-35, drafts/[draftId]/page.tsx:130-131). Caused #3 = 1 and #10 = 1.
- The two divergent format-dropdown implementations (shadcn Select in drafts/[draftId]/page.tsx:193-213 vs raw native <select> in repurpose/page.tsx:163-184). Caused #4 = 1.
- The broken @/components/ui/select import (drafts/[draftId]/page.tsx:9-15 — select.tsx does not exist). Caused #8 = 1 (crash).

Top moves from the audit (verbatim):
1. #2 Useful: Build the client-management spine — replace the clients stub with a real client list (create + open), add the missing clients/[clientId]/page.tsx workspace landing, and add the missing clients/[clientId]/drafts/page.tsx list. Evidence: both routes 404; clients is a static stub.
2. #2 Useful / #4 Understandable: Make the per-client tools navigable — add per-client sub-navigation (workspace tabs) linking calendar / drafts / knowledge / brand-voice / instagram / repurpose / generate. Evidence: app-sidebar.tsx:9-14 (no per-client nav); screens are URL-only.
3. #8 Thorough: Fix the crash and swallowed errors — create components/ui/select.tsx (or replace the import) used by drafts/[draftId]/page.tsx:9-15, and add error UI to Billing, which discards failed fetches at settings/billing/page.tsx:49,60,69.
4. #3 Aesthetic / #10 As-little-design: Unify status + variants — collapse the 4 STATUS_COLORS maps into one token-based status component, and add success/warning variants to the Alert primitive to retire 5+ hardcoded green/amber blocks (billing:87-89, instagram:46-48, hooks:148-150, compliance-badge.tsx:24).
5. #4 Understandable: De-jargon operator copy — map raw enums to human labels ("ready_for_client" → "Ready for client"), and rename/explain internal terms ("RAG-powered" knowledge:123, raw OAuth scopes instagram:101-104, "⚡ Cache hit" hooks:172-176, truncated job UUID calendar:155-157).

Redesign principles in priority order:
1. Useful (#2) — an operator can create a client, open it, reach every content tool, and route a draft to review without ever typing a URL.
2. Understandable (#4) — no raw enums or internal jargon in operator-facing copy; one consistent control per action.
3. Thorough (#8) — every screen has empty / loading / error / success / focus / disabled states; no crashing imports; nav has visible focus.
4. As little design as possible (#10) — one status component, one Generate-CTA component, one loading/empty component; remove the cache-hit/job-id/raw-scope/glyph leak-throughs.

Deliverables for the plan:
- New information architecture: clients list → client workspace landing → tabbed per-client tools (do NOT derive from the current sidebar-only nav).
- Primary flow (low-fi, labeled): create client → open → generate → save draft → calendar/schedule → send for review, compared side-by-side to the current URL-only flow.
- States checklist applied to every screen (empty, loading, error, success, focus, disabled).
- A single token-based status component + Alert success/warning variants spec.
- Migration path: how existing (Phase-1) data and the preserved generate flows attach to the new spine.
- Cutover criteria: when the clients stub and the duplicated status maps are removed.

Secondary fixes to fold in where cheap (do not let them expand scope):
- Activate or remove the inert dark mode (globals.css:27-47 — class-based, no prefers-color-scheme, no toggle) and honor prefers-reduced-motion (#9).
- Add a skip-link to (app)/layout.tsx and a focus-visible ring to sidebar nav links app-sidebar.tsx:34-39 (#8).
- Soften the calendar "Generate a full month of posts in one click" copy (calendar:106-108) to match its async, form-gated behavior (#6).

Anti-patterns to guard against (REDESIGN-specific):
- Porting the old URL-only structure under new styling — the IA must change, not just the CSS.
- Keeping both the stub clients page and a new one behind a flag indefinitely.
- Redesigning toward a dashboard trend rather than the four principles above.
- Treating the Preserve list as optional — the token system, primitives, generate flows, and compliance UX must survive intact.
- Verifying visually only: this audit was source-inferred (no running instance). Stand up a dev server with env + a Clerk SMM-operator session and re-check contrast, dark mode, and focus rings against the rendered DOM before declaring done.
```
