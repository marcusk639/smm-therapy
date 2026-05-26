import type { FetchResultRaw } from "./types";
import type { documents } from "@smm/db/schema";

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

export async function fetchIgPosts(
  doc: typeof documents.$inferSelect,
): Promise<FetchResultRaw> {
  if (!doc.rawText) {
    throw new Error(
      "Instagram posts document has no rawText. Re-create the document and paste posts (separated by '---' on its own line).",
    );
  }
  return { ...parseIgPosts(doc.rawText), title: doc.title };
}
