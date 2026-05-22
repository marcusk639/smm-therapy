# Phase 6: Trends + Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically surface trending mental health topics each week (from Reddit and psychology RSS feeds), display them as content inspiration in a digest UI, and upgrade monthly reports to include real Instagram engagement metrics when Phase 5 is complete.

**Architecture:** A weekly Inngest cron (`trend-sync`) fetches posts from Reddit's JSON API and 3 RSS feeds, filters for mental-health relevance using embedding cosine similarity against a seed query, then calls Claude Haiku to synthesize the top-10 trending topics into a `trend_topics` table row. A `/trends` page shows the digest. Monthly report route is updated to JOIN `post_metrics` for real engagement numbers.

**Tech Stack:** drizzle-orm · Inngest cron · Reddit JSON API (no auth for public reads) · `rss-parser` · Claude Haiku 4.5 · Voyage `voyage-3` embeddings + cosine similarity · `@react-pdf/renderer` (already added in Phase 4)

---

## File Structure

```
packages/db/src/schema/
├── trends.ts           NEW: trendTopics table
└── index.ts            MODIFY: export trendTopics

packages/inngest/src/functions/
└── trend-sync.ts       NEW: weekly cron + topic synthesis

packages/ai/src/agents/
└── trend-synthesizer.ts  NEW: synthesizeTrends() Claude call

apps/web/app/
├── api/v1/
│   ├── trends/route.ts                          NEW: GET recent trends for workspace
│   └── clients/[clientId]/reports/[month]/
│       └── route.ts                              MODIFY: include post_metrics
└── (app)/
    └── trends/page.tsx                           NEW: trend digest UI
```

---

### Task 1: DB Schema — trendTopics

**Files:**

- Create: `packages/db/src/schema/trends.ts`
- Modify: `packages/db/src/schema/index.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/db/src/schema/__tests__/trends.test.ts
import { describe, it, expect } from "vitest";

describe("trendTopics schema", () => {
  it("exports trendTopics", async () => {
    const mod = await import("../trends");
    expect(mod.trendTopics).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/db test`
Expected: FAIL — module not found

- [ ] **Step 3: Create trends schema**

```typescript
// packages/db/src/schema/trends.ts
import {
  pgTable,
  uuid,
  text,
  real,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces";

export const trendTopics = pgTable("trend_topics", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  weekOf: date("week_of").notNull(), // ISO date of Monday for the week
  topic: text("topic").notNull(),
  summary: text("summary").notNull(),
  subredditSources: text("subreddit_sources").array().notNull().default([]),
  rssSources: text("rss_sources").array().notNull().default([]),
  relevanceScore: real("relevance_score").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type TrendTopic = typeof trendTopics.$inferSelect;
export type NewTrendTopic = typeof trendTopics.$inferInsert;
```

Add to `packages/db/src/schema/index.ts`:

```typescript
export * from "./trends";
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
git add packages/db/src/schema/trends.ts packages/db/src/schema/index.ts
git commit -m "feat: add trend_topics table"
```

---

### Task 2: Trend Synthesizer Agent

**Files:**

- Create: `packages/ai/src/agents/trend-synthesizer.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/ai/src/agents/__tests__/trend-synthesizer.test.ts
import { describe, it, expect } from "vitest";
import { buildTrendSynthesizerPrompt } from "../trend-synthesizer";

describe("buildTrendSynthesizerPrompt", () => {
  it("includes source posts", () => {
    const prompt = buildTrendSynthesizerPrompt([
      "Therapists are burning out post-pandemic",
      "New DBT workbook for borderline clients",
      "Survey: 70% of teens report anxiety symptoms",
    ]);
    expect(prompt).toContain("burning out");
    expect(prompt).toContain("JSON");
  });

  it("requests exactly 5 topics", () => {
    const prompt = buildTrendSynthesizerPrompt(["post1", "post2"]);
    expect(prompt).toContain("5");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/ai test`
Expected: FAIL — module not found

- [ ] **Step 3: Implement trend synthesizer**

```typescript
// packages/ai/src/agents/trend-synthesizer.ts
import { anthropic, extractUsage } from "../client";

export type TrendItem = {
  topic: string;
  summary: string;
  relevanceScore: number; // 0.0–1.0
};

export type TrendSynthesizerResult = {
  trends: TrendItem[];
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
};

export function buildTrendSynthesizerPrompt(posts: string[]): string {
  const postList = posts
    .slice(0, 50)
    .map((p, i) => `${i + 1}. ${p}`)
    .join("\n");

  return `You are a mental health content strategist. Analyze these recent posts from mental health communities and identify the 5 most relevant trending topics for a therapist's Instagram account.

Posts:
${postList}

Return JSON only — an array of exactly 5 objects:
[{"topic":"...","summary":"one sentence about why this is trending and why therapists should address it","relevanceScore":0.0}]

relevanceScore: float 0.0–1.0 representing how relevant this topic is specifically to therapist social media content.`;
}

export async function synthesizeTrends(
  posts: string[],
): Promise<TrendSynthesizerResult> {
  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: buildTrendSynthesizerPrompt(posts),
      },
    ],
  });

  const usage = extractUsage(response);
  const rawText =
    response.content[0]?.type === "text" ? response.content[0].text : "[]";

  try {
    const parsed = JSON.parse(rawText) as TrendItem[];
    const trends = parsed
      .filter(
        (t): t is TrendItem =>
          typeof t.topic === "string" &&
          typeof t.summary === "string" &&
          typeof t.relevanceScore === "number",
      )
      .slice(0, 5);
    return { trends, usage };
  } catch {
    return { trends: [], usage };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @smm/ai test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/agents/trend-synthesizer.ts
git commit -m "feat: add trend synthesizer agent"
```

---

### Task 3: Trend Sync Inngest Cron

**Files:**

- Create: `packages/inngest/src/functions/trend-sync.ts`
- Modify: `packages/inngest/src/index.ts`

Sources fetched each week:

- Reddit (JSON API, no auth): `r/therapists`, `r/psychology`, `r/mentalhealth`
- RSS: APA Monitor (`https://www.apa.org/news/podcasts/speaking-of-psychology/rss`), Psychology Today blog, NAMI blog

Relevance filter: embed each title, compute cosine similarity against seed query "mental health therapy therapist Instagram content ideas". Keep items with similarity ≥ 0.6.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/inngest/src/functions/__tests__/trend-sync.test.ts
import { describe, it, expect } from "vitest";
import { filterByRelevance } from "../trend-sync";

describe("filterByRelevance", () => {
  it("returns items above threshold", () => {
    const items = [
      { title: "Post A", score: 0.75 },
      { title: "Post B", score: 0.45 },
      { title: "Post C", score: 0.8 },
    ];
    const result = filterByRelevance(items, 0.6);
    expect(result).toHaveLength(2);
    expect(result.map((i) => i.title)).toEqual(["Post A", "Post C"]);
  });

  it("returns empty array when nothing passes threshold", () => {
    expect(filterByRelevance([{ title: "x", score: 0.1 }], 0.6)).toHaveLength(
      0,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/inngest test`
Expected: FAIL — module not found

- [ ] **Step 3: Implement trend-sync**

```typescript
// packages/inngest/src/functions/trend-sync.ts
import { inngest } from "../client";
import { db } from "@smm/db/client";
import { trendTopics, workspaces } from "@smm/db/schema";
import { embed, cosineSimilarity } from "@smm/ai/embeddings";
import { synthesizeTrends } from "@smm/ai/agents/trend-synthesizer";
import Parser from "rss-parser";

const parser = new Parser();

const SUBREDDITS = ["therapists", "psychology", "mentalhealth"];
const RSS_FEEDS = [
  "https://www.apa.org/pubs/highlights/spotlight/rss",
  "https://www.psychologytoday.com/us/rss",
  "https://www.nami.org/Support-Education/NAMI-Blog/RSS",
];

const RELEVANCE_SEED =
  "mental health therapy therapist Instagram content ideas coping skills burnout anxiety";
const RELEVANCE_THRESHOLD = 0.6;

type ScoredItem = { title: string; score: number };

export function filterByRelevance(
  items: ScoredItem[],
  threshold: number,
): ScoredItem[] {
  return items.filter((i) => i.score >= threshold);
}

async function fetchRedditTitles(subreddit: string): Promise<string[]> {
  try {
    const res = await fetch(
      `https://www.reddit.com/r/${subreddit}/hot.json?limit=25`,
      { headers: { "User-Agent": "SMM-Therapy-Bot/1.0" } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as {
      data: { children: Array<{ data: { title: string } }> };
    };
    return data.data.children.map((c) => c.data.title);
  } catch {
    return [];
  }
}

async function fetchRssTitles(feedUrl: string): Promise<string[]> {
  try {
    const feed = await parser.parseURL(feedUrl);
    return (feed.items ?? [])
      .slice(0, 20)
      .map((i) => i.title ?? "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function scoreTitles(titles: string[]): Promise<ScoredItem[]> {
  if (titles.length === 0) return [];

  const [seedEmbedding] = await embed([RELEVANCE_SEED]);
  if (!seedEmbedding) return [];

  const embeddings = await embed(titles);
  return titles.map((title, i) => ({
    title,
    score: cosineSimilarity(seedEmbedding, embeddings[i]!),
  }));
}

function getWeekOf(): string {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
  return monday.toISOString().slice(0, 10);
}

export const trendSync = inngest.createFunction(
  { id: "trend-sync", retries: 2 },
  { cron: "0 8 * * 1" }, // 8 AM UTC every Monday
  async ({ step }) => {
    const weekOf = getWeekOf();

    const allTitles = await step.run("fetch-sources", async () => {
      const redditResults = await Promise.all(
        SUBREDDITS.map(fetchRedditTitles),
      );
      const rssResults = await Promise.all(RSS_FEEDS.map(fetchRssTitles));
      return [...redditResults.flat(), ...rssResults.flat()];
    });

    const scored = await step.run("score-relevance", () =>
      scoreTitles(allTitles),
    );

    const relevant = filterByRelevance(scored, RELEVANCE_THRESHOLD);
    const relevantTitles = relevant
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((i) => i.title);

    if (relevantTitles.length < 3) {
      return {
        ok: true,
        weekOf,
        skipped: true,
        reason: "too few relevant posts",
      };
    }

    const { trends } = await step.run("synthesize-trends", () =>
      synthesizeTrends(relevantTitles),
    );

    const allWorkspaces = await step.run("fetch-workspaces", () =>
      db.select({ id: workspaces.id }).from(workspaces),
    );

    await step.run("store-trends", async () => {
      for (const workspace of allWorkspaces) {
        for (const trend of trends) {
          await db.insert(trendTopics).values({
            workspaceId: workspace.id,
            weekOf,
            topic: trend.topic,
            summary: trend.summary,
            subredditSources: SUBREDDITS,
            rssSources: RSS_FEEDS,
            relevanceScore: trend.relevanceScore,
          });
        }
      }
    });

    return { ok: true, weekOf, trendCount: trends.length };
  },
);
```

- [ ] **Step 4: Add rss-parser dependency**

```bash
pnpm --filter @smm/inngest add rss-parser
pnpm --filter @smm/inngest add -D @types/rss-parser
```

- [ ] **Step 5: Register in inngest index**

Add to `packages/inngest/src/index.ts`:

```typescript
export { trendSync } from "./functions/trend-sync";
```

Add `trendSync` to the Inngest serve array in `apps/web/app/api/inngest/route.ts`.

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @smm/inngest test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/inngest/src/functions/trend-sync.ts packages/inngest/src/index.ts
git commit -m "feat: add weekly trend sync Inngest cron"
```

---

### Task 4: Trends API Route

**Files:**

- Create: `apps/web/app/api/v1/trends/route.ts`

- [ ] **Step 1: Write failing test**

```typescript
// apps/web/app/api/v1/trends/__tests__/route.test.ts
import { describe, it, expect } from "vitest";

// Schema-level test: ensure trends endpoint returns correct shape
describe("trends API", () => {
  it("validates week query param format", () => {
    const isValidWeek = (w: string) => /^\d{4}-\d{2}-\d{2}$/.test(w);
    expect(isValidWeek("2026-05-18")).toBe(true);
    expect(isValidWeek("May 18")).toBe(false);
    expect(isValidWeek("2026-5-18")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (trivial)**

Run: `pnpm --filter @smm/web test`
Expected: PASS

- [ ] **Step 3: Create trends route**

```typescript
// apps/web/app/api/v1/trends/route.ts
import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { trendTopics } from "@smm/db/schema";
import { workspaceFilter, and, eq, gte, desc } from "@smm/db/rls";

export async function GET(req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const { searchParams } = new URL(req.url);
  // Default: last 4 weeks of trends
  const since =
    searchParams.get("since") ??
    new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const rows = await db
    .select()
    .from(trendTopics)
    .where(
      and(
        workspaceFilter(trendTopics.workspaceId, workspaceId),
        gte(trendTopics.weekOf, since),
      ),
    )
    .orderBy(desc(trendTopics.weekOf), desc(trendTopics.relevanceScore))
    .limit(40);

  return NextResponse.json({ trends: rows });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/v1/trends/route.ts
git commit -m "feat: add trends list API route"
```

---

### Task 5: Trend Digest UI

**Files:**

- Create: `apps/web/app/(app)/trends/page.tsx`

- [ ] **Step 1: Create trends page**

```tsx
// apps/web/app/(app)/trends/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ExternalLink } from "lucide-react";
import Link from "next/link";

type TrendRow = {
  id: string;
  topic: string;
  summary: string;
  weekOf: string;
  relevanceScore: number;
};

function RelevanceBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 80
      ? "bg-green-100 text-green-700"
      : pct >= 60
        ? "bg-blue-100 text-blue-700"
        : "bg-gray-100 text-gray-700";
  return <Badge className={color}>{pct}% relevant</Badge>;
}

function groupByWeek(trends: TrendRow[]): Map<string, TrendRow[]> {
  const map = new Map<string, TrendRow[]>();
  for (const t of trends) {
    const key = t.weekOf;
    map.set(key, [...(map.get(key) ?? []), t]);
  }
  return map;
}

export default function TrendsPage() {
  const [trends, setTrends] = useState<TrendRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/v1/trends");
      if (res.ok) {
        const data = (await res.json()) as { trends: TrendRow[] };
        setTrends(data.trends);
      }
      setLoading(false);
    })();
  }, []);

  const grouped = groupByWeek(trends);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Trending Topics</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Weekly mental health topics from Reddit and psychology publications —
          synthesized for therapist Instagram content.
        </p>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading trends…</p>
      )}

      {!loading && trends.length === 0 && (
        <div className="rounded-md border p-6 text-center space-y-2">
          <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No trends yet. The weekly sync runs every Monday morning.
          </p>
        </div>
      )}

      {Array.from(grouped.entries()).map(([week, weekTrends]) => (
        <div key={week} className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Week of{" "}
            {new Date(week + "T00:00:00").toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
            })}
          </h2>
          {weekTrends.map((t) => (
            <div
              key={t.id}
              className="rounded-md border p-4 space-y-2 hover:bg-accent/30 transition"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-sm">{t.topic}</p>
                <RelevanceBadge score={t.relevanceScore} />
              </div>
              <p className="text-sm text-muted-foreground">{t.summary}</p>
              <div className="flex gap-2">
                <Link
                  href={`/generate/hooks?topic=${encodeURIComponent(t.topic)}`}
                >
                  <Button size="sm" variant="outline" className="gap-1 text-xs">
                    <ExternalLink className="h-3 w-3" />
                    Create content
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add Trends nav item to sidebar**

In `apps/web/components/app-sidebar.tsx`, add a Trends nav item at the workspace level (not per-client):

```typescript
{ title: "Trends", url: "/trends", icon: TrendingUp }
```

- [ ] **Step 3: Verify in dev server**

Run: `pnpm --filter @smm/web dev`
Navigate to `/trends`
Verify: Empty state renders correctly. After triggering a manual trend sync, verify trend cards appear grouped by week.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/trends/ apps/web/components/app-sidebar.tsx
git commit -m "feat: add trend digest UI page"
```

---

### Task 6: Enhanced Monthly Report (with Post Metrics)

**Files:**

- Modify: `apps/web/app/api/v1/clients/[clientId]/reports/[month]/route.ts`

This task adds real engagement metrics (from `post_metrics` table introduced in Phase 5) to the PDF report. It's backwards-compatible: if no metrics exist, the report renders the same as Phase 4.

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/app/api/v1/clients/[clientId]/reports/__tests__/report.test.ts
import { describe, it, expect } from "vitest";
import { buildReportData } from "../[month]/report-data";

describe("buildReportData with metrics", () => {
  it("sums engagement metrics", () => {
    const data = buildReportData(
      [
        { status: "published", format: "story", complianceApproved: true },
        { status: "published", format: "cta", complianceApproved: false },
      ],
      "2026-06",
      [
        { likes: 42, comments: 5, saves: 18, reach: 300, shares: 2 },
        { likes: 20, comments: 2, saves: 10, reach: 150, shares: 1 },
      ],
    );
    expect(data.totalLikes).toBe(62);
    expect(data.totalReach).toBe(450);
    expect(data.avgSaves).toBe(14);
  });

  it("handles no metrics gracefully", () => {
    const data = buildReportData(
      [{ status: "published", format: "story", complianceApproved: true }],
      "2026-06",
      [],
    );
    expect(data.totalLikes).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @smm/web test`
Expected: FAIL — buildReportData signature mismatch (doesn't accept metrics yet)

- [ ] **Step 3: Update report-data helper to accept metrics**

```typescript
// apps/web/app/api/v1/clients/[clientId]/reports/[month]/report-data.ts
type DraftSummary = {
  status: string;
  format: string | null;
  complianceApproved: boolean;
};

type MetricSummary = {
  likes: number;
  comments: number;
  saves: number;
  reach: number;
  shares: number;
};

export type ReportData = {
  month: string;
  publishedCount: number;
  approvedCount: number;
  changesRequestedCount: number;
  formatBreakdown: Record<string, number>;
  complianceRate: number;
  totalLikes: number;
  totalComments: number;
  totalSaves: number;
  totalReach: number;
  avgLikes: number;
  avgSaves: number;
  hasMetrics: boolean;
};

export function buildReportData(
  drafts: DraftSummary[],
  month: string,
  metrics: MetricSummary[] = [],
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

  const totalLikes = metrics.reduce((s, m) => s + m.likes, 0);
  const totalComments = metrics.reduce((s, m) => s + m.comments, 0);
  const totalSaves = metrics.reduce((s, m) => s + m.saves, 0);
  const totalReach = metrics.reduce((s, m) => s + m.reach, 0);

  return {
    month,
    publishedCount: published.length,
    approvedCount: approved.length,
    changesRequestedCount: changesRequested.length,
    formatBreakdown,
    complianceRate,
    totalLikes,
    totalComments,
    totalSaves,
    totalReach,
    avgLikes: metrics.length > 0 ? Math.round(totalLikes / metrics.length) : 0,
    avgSaves: metrics.length > 0 ? Math.round(totalSaves / metrics.length) : 0,
    hasMetrics: metrics.length > 0,
  };
}
```

- [ ] **Step 4: Update report route to JOIN post_metrics**

In `apps/web/app/api/v1/clients/[clientId]/reports/[month]/route.ts`, add a JOIN to `postMetrics`:

After the `draftRows` query, add:

```typescript
import { postMetrics } from "@smm/db/schema";

const draftIds = draftRows.map((d) => d.id); // need to select id too
const metricRows =
  draftIds.length > 0
    ? await db
        .select({
          likes: postMetrics.likes,
          comments: postMetrics.comments,
          saves: postMetrics.saves,
          reach: postMetrics.reach,
          shares: postMetrics.shares,
        })
        .from(postMetrics)
        .where(
          and(
            workspaceFilter(postMetrics.workspaceId, workspaceId),
            inArray(postMetrics.draftId, draftIds),
          ),
        )
    : [];

const data = buildReportData(draftRows, month, metricRows);
```

Also update the PDF to render the engagement section when `data.hasMetrics`:

```tsx
{
  data.hasMetrics && (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Engagement (Instagram)</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Total reach</Text>
        <Text style={styles.value}>{data.totalReach.toLocaleString()}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Total likes</Text>
        <Text style={styles.value}>{data.totalLikes}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Total saves</Text>
        <Text style={styles.value}>{data.totalSaves}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Avg. likes per post</Text>
        <Text style={styles.value}>{data.avgLikes}</Text>
      </View>
    </View>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @smm/web test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/api/v1/clients/[clientId]/reports/"
git commit -m "feat: include Instagram engagement metrics in monthly PDF report"
```

---

### Manual prerequisites

- [ ] Add `rss-parser` types: `pnpm --filter @smm/inngest add -D @types/rss-parser`
- [ ] Verify the 3 RSS feed URLs are accessible and return valid RSS
- [ ] Add `NEXT_PUBLIC_APP_URL` to `.env.example` (used for redirect URIs)
