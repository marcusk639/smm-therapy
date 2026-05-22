import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { FetchResultRaw } from "./types";
import type { documents } from "@smm/db/schema";

export async function fetchWebUrl(
  doc: typeof documents.$inferSelect,
): Promise<FetchResultRaw> {
  if (!doc.sourceUrl) throw new Error("Document has no sourceUrl");

  const res = await fetch(doc.sourceUrl, {
    headers: { "User-Agent": "SMM-Therapy-Bot/1.0" },
  });
  if (!res.ok) throw new Error(`URL returned ${res.status}: ${res.statusText}`);

  const html = await res.text();
  const { document } = parseHTML(html);
  const reader = new Readability(document as unknown as Document);
  const article = reader.parse();

  if (!article?.textContent)
    throw new Error("Could not extract readable content from this URL.");

  return {
    text: article.textContent.replace(/\s+/g, " ").trim(),
    title: article.title ?? doc.title,
    metadata: { sourceUrl: doc.sourceUrl },
  };
}
