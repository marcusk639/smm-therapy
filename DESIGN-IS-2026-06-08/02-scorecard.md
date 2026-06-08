# 02 — Scorecard

Each principle scored 0–3 against the Phase 2 anchors. Tie-breaker: pick lower. Score the worst representative instance, not the mean. Total = sum, max 30.

---

**1. Good design is innovative — Score: 2/3**
Evidence: Generic shadcn dashboard chrome (sidebar + cards + forms), but the generation flow surfaces a real domain improvement — in-line compliance violations, crisis-resource appending, and KB citations (`generate/hooks/page.tsx:151-158,183-201`; `compliance-badge.tsx`). [01-evidence §A, §C]
Justification: The compliance-in-the-loop content UX is a clear improvement on a generic content generator (above 1), but the surrounding form/nav patterns are standard, not novel (below 3).

**2. Good design makes a product useful — Score: 0/3**
Evidence: The primary task (manage clients → open a client → manage content) is **not supported in the UI**: `clients/page.tsx:5-7` is a static stub, `clients/[clientId]/page.tsx` and `drafts/page.tsx` don't exist (both 404), per-client screens have no nav entry (`app-sidebar.tsx:9-14`) and no inbound links, and the draft editor imports a non-existent `@/components/ui/select` (`drafts/[draftId]/page.tsx:9-15`). [01-evidence §A, §F.1, §F.2]
Justification: Anchor-0 verbatim — "primary task is not directly supported on the screen audited"; an operator literally cannot open a client or reach the content tools through the interface.

**3. Good design is aesthetic — Score: 1/3**
Evidence: Disciplined base system (4px spacing grid, 5-size type scale, 2 weights, 19 semantic tokens) is undercut by ~5 systemic inconsistencies: an off-token ~9-family color palette in 4 duplicated status maps, radius inconsistency (`rounded-xl`/`lg`/`md`), hand-rolled card containers bypassing `Card`, and an `Alert` missing success/warning variants forcing 5+ hardcoded green/amber blocks. [01-evidence §B]
Justification: Anchor-1 verbatim — "3–5 inconsistencies"; the strong token foundation keeps it off 0, but the violation count is well past the ≤2 needed for 2.

**4. Good design makes a product understandable — Score: 1/3**
Evidence: Pervasive jargon and raw-enum exposure ("Repurpose", "Knowledge Base", "RAG-powered", "CTA", "Disclosure", "ready_for_client", raw OAuth scopes, truncated job UUID) plus two divergent dropdown implementations for one action and 3 orphaned form labels. [01-evidence §C, §E]
Justification: Anchor-1 verbatim — "2–3 controls unclear; jargon present"; existing CTAs (Generate, Save Draft) are identifiable, so not 0, but jargon is everywhere.

**5. Good design is unobtrusive — Score: 2/3**
Evidence: Chrome is generally quiet (subtle shadows, muted secondary text, color transitions, skeletons; zero idle animation, zero attention-demanding load elements) but leaks technical detail: "⚡ Cache hit", job-id slice, raw OAuth scope block, checkmark glyph in a button, and a Billing screen carrying non-billing data-export. [01-evidence §A, §B, §D]
Justification: Anchor-2 verbatim — "chrome visible but quiet"; content stays the figure, but several technical leak-throughs stop it short of 3.

**6. Good design is honest — Score: 2/3**
Evidence: No dark patterns (explicit cancel "No charges were made" `billing:96-99`, Stripe portal cancel path, no pre-checked opts, prices+renewal disclosed); exactly one inflation — calendar "Generate a full month of posts in one click" for an async, form-gated job (`calendar:106-108` vs handler `:62-91`). [01-evidence §C]
Justification: Anchor-2 verbatim — "≤1 minor inflation"; strong honesty overall, one overclaim keeps it off 3.

**7. Good design is long-lasting — Score: 2/3**
Evidence: Neutral slate shadcn language with no loud trend markers (no glassmorphism, fad gradients, or skeuomorphism) that would read fine in 3 years; mild dated markers are emoji-as-UI ("⚡ Cache hit", "Saved ✓" glyph). [01-evidence §B, §A]
Justification: Anchor-2 verbatim — "1 dated marker"; the timeless base is dragged off 3 only by the emoji/glyph-in-UI residue.

**8. Good design is thorough down to the last detail — Score: 1/3**
Evidence: Generate flows are complete (loading+error+disabled+validation), but on real screens 2–3 states are missing/broken: Billing swallows fetch errors with no error UI and no zero-state (`billing:49,60,69`), dashboard/clients are stateless stubs, the draft editor's missing `select.tsx` is a crash, and sidebar nav lacks a focus-visible ring. [01-evidence §A, §B, §E]
Justification: Anchor-1 verbatim — "2–3 states missing" on load-bearing screens, plus a broken component; worst-instance scoring prevents a 2.

**9. Good design is environmentally friendly — Score: 2/3**
Evidence: Lean client bundle (est. <500KB gzip; no charting/animation/editor libs client-side; heaviest dep server-only; per-glyph icon imports), motion gated to loading only — but dark mode is authored yet inert (no `prefers-color-scheme`, no toggle) and `prefers-reduced-motion` is unrespected. [01-evidence §D]
Justification: Anchor-2 verbatim — "<500KB, motion gated"; dark-mode-not-honored blocks the 3 (which requires dark mode honored + reduced-motion respected).

**10. Good design is as little design as possible — Score: 1/3**
Evidence: ~6 removable user-facing extras (cache-hit badge, job UUID, raw scope list, checkmark glyph, on-Billing data export, double current-plan badge) plus duplicated affordances (two format dropdowns, hand-rolled Generate CTA ×3, hand-rolled loading state ×5, status maps + FORMATS + Violation each redeclared 3×). [01-evidence §A, §B]
Justification: Anchor-1 verbatim — well past "3–5 removable elements"; not 0 only because the core screens aren't visually decoration-dominated — the excess is removable extras and duplication, not chrome bloat.

---

## Total: 14 / 30

| #   | Principle                    | Score       |
| --- | ---------------------------- | ----------- |
| 1   | Innovative                   | 2           |
| 2   | Useful                       | **0**       |
| 3   | Aesthetic                    | 1           |
| 4   | Understandable               | 1           |
| 5   | Unobtrusive                  | 2           |
| 6   | Honest                       | 2           |
| 7   | Long-lasting                 | 2           |
| 8   | Thorough                     | 1           |
| 9   | Environmentally friendly     | 2           |
| 10  | As little design as possible | 1           |
|     | **Total**                    | **14 / 30** |

Load-bearing flag: **#2 Useful = 0.**
