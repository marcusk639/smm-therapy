import type { FetchResultRaw } from "./types";

export function parseIgPosts(rawText: string): FetchResultRaw {
  const posts = rawText
    .split(/\n---\n/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 10);

  return {
    text: posts.join("\n\n---\n\n"),
    title: "Instagram Posts",
    metadata: { postCount: posts.length },
    posts,
  };
}
