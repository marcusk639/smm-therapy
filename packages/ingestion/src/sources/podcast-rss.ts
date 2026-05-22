import Parser from "rss-parser";
import type { FetchResultRaw } from "./types";
import type { documents } from "@smm/db/schema";

export async function fetchPodcastRss(
  doc: typeof documents.$inferSelect,
): Promise<FetchResultRaw> {
  if (!doc.sourceUrl) throw new Error("Document has no sourceUrl");

  const parser = new Parser();
  let feed: Awaited<ReturnType<typeof parser.parseURL>>;

  try {
    feed = await parser.parseURL(doc.sourceUrl);
  } catch {
    throw new Error(
      "Feed URL is unreachable or invalid. Check the RSS URL and try again.",
    );
  }

  const lines: string[] = [];
  for (const item of feed.items ?? []) {
    if (item.title) lines.push(item.title);
    if (item.contentSnippet) lines.push(item.contentSnippet);
    if (item.content) lines.push(item.content.replace(/<[^>]+>/g, " ").trim());
    lines.push("");
  }

  return {
    text: lines.join("\n"),
    title: feed.title ?? doc.title,
    metadata: { feedUrl: doc.sourceUrl, episodeCount: feed.items?.length ?? 0 },
  };
}
