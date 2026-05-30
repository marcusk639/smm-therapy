import Parser from "rss-parser";
import { inngest } from "../client";
import { db } from "@smm/db/client";
import { trendTopics } from "@smm/db/schema";
import {
  synthesizeTrends,
  type TrendSynthesizerResult,
} from "@smm/ai/agents/trend-synthesizer";
import {
  filterByRelevance,
  buildWeekOf,
  type ScoredPost,
} from "./trend-sync-utils";

const RELEVANCE_THRESHOLD = 0.6;

const SUBREDDIT_SOURCES = [
  "r/therapy",
  "r/mentalhealth",
  "r/anxiety",
  "r/depression",
  "r/therapists",
];

const RSS_SOURCES = [
  "https://www.psychologytoday.com/us/rss",
  "https://www.apa.org/news/rss/index",
];

async function fetchRedditPosts(subreddit: string): Promise<ScoredPost[]> {
  const name = subreddit.replace("r/", "");
  const url = `https://www.reddit.com/${subreddit}/top.json?limit=25&t=week`;
  const res = await fetch(url, {
    headers: { "User-Agent": "smm-therapy-bot/1.0" },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as {
    data: {
      children: Array<{
        data: { title: string; selftext: string; score: number; ups: number };
      }>;
    };
  };
  return json.data.children.map((child) => {
    const { title, selftext, ups } = child.data;
    // Normalize upvotes to a rough 0–1 relevance proxy
    const score = Math.min(ups / 5000, 1.0);
    return { text: `${title} ${selftext}`.slice(0, 500), score };
  });
}

async function fetchRssPosts(feedUrl: string): Promise<ScoredPost[]> {
  const parser = new Parser();
  try {
    const feed = await parser.parseURL(feedUrl);
    return (feed.items ?? []).slice(0, 20).map((item) => ({
      text: `${item.title ?? ""} ${item.contentSnippet ?? ""}`.slice(0, 500),
      score: 0.7, // RSS from curated sources starts at a higher baseline
    }));
  } catch {
    return [];
  }
}

export const trendSync = inngest.createFunction(
  { id: "trend-sync", name: "Weekly Trend Sync", retries: 1 },
  { cron: "0 8 * * 1" }, // Monday 08:00 UTC
  async ({ step, logger }) => {
    const weekOf = buildWeekOf(new Date());

    const allPosts = await step.run("fetch-posts", async () => {
      const results = await Promise.allSettled([
        ...SUBREDDIT_SOURCES.map(fetchRedditPosts),
        ...RSS_SOURCES.map(fetchRssPosts),
      ]);
      return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
    });

    const relevant = filterByRelevance(allPosts, RELEVANCE_THRESHOLD);
    logger.info(
      `Trend sync: ${allPosts.length} posts → ${relevant.length} relevant`,
    );

    if (relevant.length === 0) {
      return { weekOf, stored: 0 };
    }

    const postTexts = relevant.slice(0, 50).map((p) => p.text);

    const { trends } = await step.run(
      "synthesize",
      async (): Promise<TrendSynthesizerResult> => synthesizeTrends(postTexts),
    );

    const workspaces = await step.run("get-workspaces", async () => {
      const { workspaces: wsTable } = await import("@smm/db/schema");
      return db.select({ id: wsTable.id }).from(wsTable);
    });

    await step.run("store-trends", async () => {
      if (workspaces.length === 0 || trends.length === 0) return;

      const rows = workspaces.flatMap((ws) =>
        trends.map((t) => ({
          workspaceId: ws.id,
          weekOf,
          topic: t.topic,
          summary: t.summary,
          subredditSources: SUBREDDIT_SOURCES,
          rssSources: RSS_SOURCES,
          relevanceScore: t.relevanceScore,
        })),
      );

      await db.insert(trendTopics).values(rows);
    });

    return { weekOf, stored: trends.length * workspaces.length };
  },
);
