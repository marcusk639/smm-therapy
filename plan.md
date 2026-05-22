# Task: Generate Implementation Plan for Therapy-Practice SMM Automation Platform

Use the superpowers plugin's planning workflow to generate a detailed, phased implementation plan for the project described below. Do NOT begin implementation. Produce a plan document I can review and approve before any code is written.

## Planning requirements

- Invoke the superpowers planning workflow explicitly
- Break the plan into discrete, independently shippable phases
- For each phase: deliverables, file/module structure, dependencies, acceptance criteria, estimated complexity, and explicit "definition of done"
- Identify cross-cutting concerns (auth, multi-tenancy, observability, error handling, testing strategy, compliance guardrails) and address them in a foundation phase rather than scattered across feature phases
- Flag every assumption you make and every decision that requires my input before implementation
- Call out external dependencies with lead times (Meta app review especially)
- Include a testing strategy per phase (unit, integration, e2e where applicable)
- Include a "risks and unknowns" section at the end of each phase

## Product overview

A multi-tenant SaaS web app that automates Instagram content creation and client-handoff workflows for social media managers serving **licensed mental health practitioners** (therapists, psychologists, counselors, group practices) as the launch niche. Designed to expand to adjacent niches (mental wellness coaches, fitness/exercise coaches) in v2.

Target user: solo or small-team SMMs managing 3–15 mental-health-practice clients on Instagram. Sold as a productized SaaS at premium pricing ($150–400/mo) justified by niche depth, compliance safety, and workflow speed.

## Positioning and differentiation (drives feature priorities)

The product wins on four explicit differentiators. Every feature decision should reinforce at least one:

1. **Niche depth for mental health practices** — built-in awareness of clinical ethics codes (APA, ACA, NASW, state licensing boards), HIPAA-adjacent content rules, scope-of-practice constraints, prohibition on testimonials in many states, no diagnostic claims, mandatory crisis resources, no specific clinical advice. Niche-specific content patterns (psychoeducation, normalization, coping skills, myth-busting, "what therapy actually is"). Niche-specific trend sources and example libraries.

2. **Advanced knowledge base layer** — best-in-class RAG. Per-client knowledge bases that ingest the SMM's swipe file, the client's best-performing past posts, the client's brand documents, relevant educational content (podcasts, YouTube transcripts, blog posts, course materials the SMM has rights to). Every generation is grounded in retrieved context: niche patterns + client voice + client's proven-performing content + relevant educational material. Hybrid search (semantic + keyword + recency boost). Reranking. Source citations on generated content so SMMs can verify where ideas came from.

3. **Client-handoff workflow depth** — the full draft → internal review → client approval → revision → scheduled → published → reported flow as a first-class feature. White-labeled, branded client approval portal (per-client subdomain or branded link). Mobile-optimized so therapists can approve from their phone between sessions. Threaded comments per post. One-click approve/request-changes. Auto-generated monthly client reports (white-labeled). Email/SMS notifications to clients when content needs review.

4. **Workflow speed** — every common action should be ≤3 clicks from idea to scheduled. Agent-driven defaults so SMMs aren't filling out forms; the system proposes, they edit. Bulk operations (generate 4 weeks of content for a client in one workflow). Keyboard shortcuts. Inline editing rather than modals where possible.

## Core product workflows (v1 scope)

### Generation

1. **Hook generator** — 10–20 Instagram hooks per topic, ranked against proven-performing hook patterns from the niche library + the client's best-performing past hooks. Filtered for compliance (no diagnostic claims, no testimonial framing where prohibited).
2. **Caption generator** — multiple variants per post (psychoeducation, normalization, coping skill, story-driven, CTA), brand-voice-aware, compliance-checked, with appropriate disclaimers auto-appended where required.
3. **Content calendar** — generates 2–4 weeks of post ideas per client, balanced across niche-specific content pillars (psychoeducation / coping skills / normalization / behind-the-scenes / community / awareness days). Respects mental health awareness calendar (Suicide Prevention Month, Mental Health Awareness Month, etc.).
4. **Content repurposing** — turn one long-form input (therapist's blog post, podcast appearance transcript, voice note) into a week of IG content (carousel, single posts, Reel scripts, Stories).
5. **Brand voice profiles** — per-client voice guides built from sample content the SMM uploads (past posts, the client's website copy, the client's intake materials, recordings of the client). Captures clinical tone calibration (warm vs authoritative, plain-language vs clinical vocabulary, level of personal disclosure).
6. **Compliance guardrails** — every generation passes through a compliance critic that flags: diagnostic claims, treatment guarantees, testimonial-shaped content where prohibited, missing crisis resources on heavy topics, scope-of-practice violations, prohibited supplement/medication claims. Configurable per state and per credential type (LCSW vs LMFT vs PsyD vs LPC have slightly different rules).

### Knowledge layer

7. **Per-client knowledge bases** — each client has their own knowledge base. Sources:
   - Uploaded files (audio, video, PDF, text)
   - YouTube URL (official transcript API + yt-dlp fallback)
   - Podcast RSS feed
   - Google Drive folder connection
   - Public web URL ingestion (blogs, articles)
   - The client's own past IG posts (manually pasted or via Meta Graph API import)
     Each upload requires a user-facing "I have rights to this content" confirmation.
8. **Niche knowledge base (shared)** — curated by us, available to all customers: clinical ethics code summaries, state-by-state advertising rules for mental health practitioners, niche content pattern library, mental health awareness calendar, crisis resource templates.
9. **Hybrid retrieval** — dense embeddings + BM25 keyword + recency boost. Reranker on top. Citations surfaced in UI. Per-client and shared-niche knowledge bases blended at retrieval time with configurable weighting.

### Client handoff

10. **Client approval portal** — branded, per-client URL. Mobile-first. Lists posts pending approval. Tap to view, swipe between posts, approve / request changes with optional comment. No login required for clients beyond email magic link.
11. **Internal review workflow** — SMM marks content "ready for client" → client gets notification → client approves or requests changes → SMM revises → resubmits → on approval, content moves to scheduled.
12. **Threaded comments** — per-post comment threads between SMM and client.
13. **Auto-generated monthly reports** — white-labeled PDF/web report per client: posts published, reach/impressions/saves from Meta Graph API, follower growth, top-performing content, content pillar breakdown.
14. **Notifications** — email + optional SMS to clients when content is pending review or scheduled.

### Trends

15. **Trend analysis** — niche-relevant trends synthesized from: Google Trends API, Reddit (r/therapists, r/therapy, r/mentalhealth, r/psychotherapy and related, with sentiment/topic clustering), curated mental health publication RSS (Psychology Today, APA news, NIMH announcements), awareness calendar events, recent search interest spikes. Weekly synthesis per client niche-context. Reels audio trend tracking deferred to v2 (no reliable legal source).

### Scheduling

16. **Instagram scheduling** — push approved content to Meta's Graph API with scheduled publish times. Sync post status back. Support carousels, single image posts, Reels (with cover frame selection), Stories.

### Workspace and clients

17. Multi-tenant: workspace (SMM agency) → clients (mental health practices) → content. Per-client brand voice, knowledge base, content calendar, approval portal, brand assets.

**Out of scope for v1:** TikTok, LinkedIn, image/video generation, team collaboration features beyond single SMM + clients, analytics dashboards beyond the auto-generated client reports, Reels audio trend tracking.

## Technical stack (locked decisions — do not propose alternatives)

- **Frontend:** Next.js 15 (App Router), SSR for marketing pages, client-rendered app shell, Tailwind + shadcn/ui. The client approval portal is part of the same Next.js app but lives on a separate route group with its own minimal layout, branded per client.
- **API:** RESTful, OpenAPI 3.1 spec, zod-first schemas with `@asteasolutions/zod-to-openapi` generating the spec, Next.js Route Handlers (`app/api/v1/...`), bearer token auth for SMM users, email magic-link tokens for client portal access, cursor pagination, `/api/v1/` versioning prefix, idempotency keys on expensive POSTs, `202 Accepted` + job polling pattern for long-running operations.
- **Backend orchestration:** Temporal for long-running workflows (transcription, batch generation, scheduled posting, monthly report generation, knowledge base ingestion).
- **Database:** Postgres with pgvector extension (HNSW indexes) for the knowledge layer. Postgres `tsvector` for BM25-style keyword search. No separate vector database.
- **Object storage:** S3-compatible.
- **Auth:** Clerk or WorkOS (you decide and justify) for SMM users — workspace-aware, multi-tenant. Client approval portal uses email magic-link only (no client accounts).
- **Billing:** Stripe.
- **AI layer:**
  - Claude Agent SDK for multi-step workflows (calendar generation, repurposing, trend synthesis, compliance critic, voice consistency critic)
  - Raw Anthropic API for single-shot generation (hooks, individual captions)
  - Aggressive prompt caching on niche knowledge, brand voice profiles, and retrieved knowledge chunks
- **Transcription:** Groq Whisper primary, OpenAI Whisper fallback.
- **Notifications:** Resend for email, Twilio for SMS.
- **PDF generation (for client reports):** React-PDF or Puppeteer-based; you recommend.
- **Monorepo:** pnpm workspaces, Turborepo.

### RAG layer (locked architecture — do not propose alternatives)

The RAG layer is built in-house on commodity components. Do not propose managed RAG platforms (Pinecone Assistant, Vectara, LlamaCloud, Ragie, Carbon, OpenAI Assistants file_search, etc.). Do not propose separate vector databases (Pinecone, Weaviate, Qdrant, Chroma). Do not propose LangChain or Haystack as orchestration frameworks. LlamaIndex may be used selectively for document parsers and node parsers if it meaningfully accelerates ingestion work, but not for retrieval orchestration or agent logic.

Required components:

- **Storage:** Postgres + pgvector with HNSW indexes. Schema designed around the multi-tenant model: `workspace → client → knowledge_base → document → chunk`. Chunks carry rich metadata columns: source type, source URL, ingestion timestamp, content timestamp (when the original was published), compliance tags, content pillar, client performance score (for the client's own past posts), language, rights confirmation reference.
- **Multi-tenant isolation:** workspace_id and client_id as first-class columns on every retrieval-relevant table, with Postgres row-level security policies enforcing isolation. A therapist's intake materials must never leak across clients.
- **Embeddings (vendor API, not self-hosted):** Voyage `voyage-3` or `voyage-3-large` as primary. Justify the choice between the two based on cost/quality for this workload. Embedding calls go through a thin internal abstraction so the provider can be swapped without touching call sites.
- **Reranking (vendor API):** Voyage `voyage-rerank-2` or Cohere Rerank 3.5 on the top 50 results from hybrid search before final LLM consumption. Justify the choice.
- **Document parsing:** `unstructured` (Python service, called via Temporal activity) for PDFs and complex documents. Simple recursive character splitter for clean text. Naive parsers are not acceptable for PDFs with tables or layout complexity.
- **Chunking strategy (per source type):**
  - Clean text (blog posts, captions, manually entered notes): recursive character splitter with overlap
  - Transcripts (podcasts, videos, voice notes): semantic chunking — split on topic shifts using embedding similarity between adjacent windows, not fixed character counts. This is non-negotiable for transcript quality.
  - Structured documents (PDFs with sections/headings): respect heading boundaries; chunk within sections
  - The client's past IG posts: one post = one chunk (do not split)
- **Hybrid search:** dense vector search via pgvector + BM25-style keyword search via Postgres `tsvector` (or Tantivy if Postgres FTS proves insufficient — justify if switching). Combine results via Reciprocal Rank Fusion (RRF). Recency boost applied as a multiplicative factor on the fused score, configurable per knowledge base type (heavier boost on client's own recent posts, lighter on shared niche content).
- **Retrieval orchestration:** a typed `retrieve(query, options)` module that owns: per-client vs shared-niche routing and blending, metadata filtering (by content pillar, compliance tag, source type, date range), hybrid fusion, reranking, citation construction, query rewriting for ambiguous queries. This module is the differentiation surface and must be cleanly testable in isolation.
- **Ingestion orchestration:** Temporal workflows with stages `fetch → parse → chunk → embed → store`. Each stage is an idempotent activity with retry policies. Failed documents are surfaced in the UI with the stage that failed and a retry action.
- **Citations:** every generated piece of content includes a citation list pointing back to the chunks that informed it. Citations are stored alongside the generation in the audit log and surfaced in the SMM UI on hover/click.
- **Evaluation harness:** a small in-house eval system run on every change to retrieval logic. The harness scores retrieval against a hand-curated set of query/expected-chunk pairs (50–200 per niche, authored by the domain expert). Metrics: recall@k, MRR, and a separate "LLM-as-judge" qualitative score. Tools like Ragas or Promptfoo may be used to scaffold the harness, but the eval set itself is hand-curated. The eval harness must be runnable locally and in CI.

## Knowledge ingestion architecture

The in-product pipeline must be source-agnostic with explicit rights confirmation per upload. Sources listed above.

A **separate, standalone CLI tool** (own repo, not part of deployed product, runs locally on my machine only) handles scraping protected course platforms (e.g., carolineflett.com) using my paid credentials. Outputs transcripts to a local folder. I manually decide what to ingest into my own workspace as "personal notes." Never deployed, never shipped, never referenced from product code.

Plan both the in-product source-agnostic pipeline AND the standalone CLI as separate deliverables.

## Compliance guardrails — specific requirements

This is a major differentiator and needs to be a first-class system, not bolted on:

- **Rules engine:** structured rule definitions per credential type and state. Stored as data, not code, so non-engineers can update them.
- **Compliance critic:** a Claude Agent SDK workflow that reviews every generation against applicable rules before surfacing to the SMM. Flags violations with citations to the underlying rule.
- **Disclaimer injection:** automatic appending of required disclaimers per content type and state (e.g., "This content is for educational purposes and not a substitute for professional mental health care").
- **Crisis resource handling:** when content touches suicide, self-harm, abuse, or eating disorders, the system requires inclusion of crisis resources (988, Crisis Text Line, etc.) and surfaces a warning in the SMM UI.
- **Audit log:** every piece of generated and published content is logged with the rules applied at generation time, so the SMM can defend the choice if questioned by a licensing board.

## Phased build sequence (use this structure)

- **Phase 0** — Monorepo foundation, Next.js + REST API scaffolding, Postgres + pgvector + Temporal, auth, multi-tenant data model (workspace/client/content/knowledge-base entities with row-level security), basic CRUD, compliance rules engine scaffolding (no rules yet), Meta app review submitted with demo video.
- **Phase 1** — Generation core: hook generator, caption generator, brand voice profile builder. Includes the compliance critic from day one with an initial rule set covering APA + the top 5 states by mental health professional density (CA, NY, TX, FL, IL). Niche-specific prompt engineering and example libraries. No RAG yet — pure prompting + curated few-shot examples.
- **Phase 2** — Knowledge layer (RAG). Per the locked architecture above:
  - Schema for `workspace → client → knowledge_base → document → chunk` with row-level security policies
  - Ingestion Temporal workflows for every source type (file upload, YouTube, podcast RSS, Google Drive, web URL, manual paste of past IG posts)
  - Document parsing via `unstructured` (Python service called as Temporal activity)
  - Per-source-type chunking (recursive for clean text, semantic for transcripts, heading-aware for structured PDFs, one-chunk-per-post for IG posts)
  - Embeddings via Voyage with a thin provider-swappable abstraction
  - Hybrid retrieval (pgvector dense + Postgres tsvector BM25, fused via RRF, recency boost)
  - Reranking via Voyage rerank-2 or Cohere Rerank 3.5
  - Typed `retrieve(query, options)` module with per-client / shared-niche routing
  - Citation construction and UI integration
  - Eval harness with initial eval set (eval set is a domain expert deliverable, not engineering)
  - Retrieval integrated into all Phase 1 generation workflows
- **Phase 3** — Agent workflows: content calendar (niche pillars + awareness calendar aware), repurposing, voice consistency critic, expanded compliance critic with full 50-state rule coverage. Claude Agent SDK integration.
- **Phase 4** — Client handoff: client approval portal (branded per client, mobile-first, magic-link auth), internal review workflow, threaded comments, notifications (email + SMS).
- **Phase 5** — Meta integration: Instagram Business auth (assuming app review approved by now), scheduled publishing, post status sync, performance data sync for monthly reports.
- **Phase 6** — Trends + reports: Google Trends, Reddit, curated RSS aggregation with niche relevance filter. Weekly trend synthesis per client. Auto-generated monthly client reports (white-labeled PDF/web).
- **Phase 7** — Billing, onboarding, pricing page, docs, niche-specific marketing site, launch prep.
- **Parallel track** — Standalone Caroline Flett scraper CLI (separate repo, ~1 day of work).

## My background (for calibrating depth)

I'm a staff-level engineer with ~10 years of experience including recent AI application work. I currently work on a monorepo with microservices, Temporal, and microfrontends. I have prior professional experience building RAG systems from scratch and am comfortable owning the retrieval layer end-to-end. Assume familiarity with TypeScript, Next.js, Postgres, pgvector, Temporal, agent architectures, RAG. Skip basic explanations. Be terse and technical. Flag genuine tradeoffs; don't pad with caveats I'd already know.

My wife is a working social media manager with deep domain knowledge in mental health / therapy and significant interest in fitness coaching. She will be the design partner, content authority for the niche knowledge base and compliance rules, and the first user. Factor her involvement into the plan — there should be explicit deliverables for "content/rules to be authored by domain expert" separate from engineering work. The retrieval eval set is one such deliverable.

## Output format

Produce the plan as a single markdown document with:

1. Executive summary (≤10 lines)
2. Decisions requiring my input before Phase 0 starts (numbered list)
3. Cross-cutting concerns section (including compliance, multi-tenancy, observability, testing, RAG evaluation discipline)
4. Domain expert (wife) deliverables — separate section listing what she needs to produce per phase
5. One section per phase using the structure specified above
6. Risks and open questions (consolidated, at the end)
7. Recommended order of operations for the first two weeks (day-by-day or task-by-task)

Do not write any code. Do not create any files other than the plan document itself. Stop after producing the plan and wait for my review.
