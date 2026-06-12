# 03 — Verdict

## REDESIGN

The SMM-operator surface scores **14/30 with #2 (Useful) at 0** — the primary task of managing clients and routing content is unreachable through the UI, so the navigation/IA spine must be rebuilt from purpose while preserving the genuinely strong token system and compliance-aware generate flows.

## Why REDESIGN, not REFINE or NEW

- **Not REFINE:** Two independent triggers fire — total 14 is below the 20 threshold, **and** a load-bearing principle (#2 Useful) scored 0. The Phase 3 rule is mechanical: either alone forces REDESIGN.
- **Not NEW:** Real design decisions exist and are worth keeping — the HSL token system, the shadcn primitive library, and the fully-built generate/captions/hooks/brand-voice flows with their compliance UX, loading/error/validation states, and citations. This is not a blank stub; it is a good product whose connective tissue (clients list → client workspace) was never built.
- The failure is structural, not cosmetic: an operator cannot open a client (`clients/page.tsx` is a stub; `clients/[clientId]/page.tsx` 404s; per-client screens have no nav/links), and the draft editor imports a non-existent component. Restyling cannot fix "the task has no entry point" — that is a REDESIGN of the spine.

## Highest-leverage moves (spine of the next plan)

1. **#2 Useful — Build the client-management spine.** Replace the `clients/page.tsx:5-7` stub with a real client list (create + open), add the missing `clients/[clientId]/page.tsx` client-workspace landing, and add the missing `clients/[clientId]/drafts/page.tsx` list. Evidence: `01-evidence §A` (both routes 404; clients is a static stub).
2. **#2 Useful / #4 Understandable — Make the per-client tools navigable.** Add per-client navigation (sub-nav or workspace tabs) linking calendar / drafts / knowledge / brand-voice / instagram / repurpose / generate; today they are URL-only (`app-sidebar.tsx:9-14` lists only Dashboard/Clients/Trends/Billing). Evidence: `01-evidence §A, §F.1`.
3. **#8 Thorough — Fix the crash and the swallowed errors.** Create the missing `components/ui/select.tsx` (or replace the import) used by `drafts/[draftId]/page.tsx:9-15`, and add error UI to Billing, which currently discards failed fetches (`settings/billing/page.tsx:49,60,69`). Evidence: `01-evidence §A, §B`.
4. **#3 Aesthetic / #10 As-little-design — Unify the status + variant system.** Collapse the 4 duplicated, off-token, light-mode-only `STATUS_COLORS` maps (`calendar:19-27`, `knowledge:33-42`, `repurpose:32-35`, `drafts:130-131`) into one token-based status component, and add `success`/`warning` variants to `Alert` to retire the 5+ hardcoded green/amber blocks. Evidence: `01-evidence §A, §B`.
5. **#4 Understandable — De-jargon operator-facing copy.** Map raw enums to human labels ("ready_for_client" → "Ready for client") and rename/explain internal terms ("RAG-powered", raw OAuth scopes, "Cache hit", job UUID). Evidence: `01-evidence §C`.

Secondary (fold into the above where cheap): activate or remove the inert dark mode and honor `prefers-reduced-motion` (#9, `01-evidence §D`); add a skip-link and a focus-visible ring to sidebar nav (#8, `01-evidence §E`); soften the calendar "one click" overclaim to match its async behavior (#6, `01-evidence §C`).
