import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { ScrapedPage, ParsedBlock } from "./types.js";

export function cleanText(text: string): string {
  return text
    .replace(/[​‌‍﻿]/g, "") // zero-width chars
    .replace(/\s+/g, " ")
    .trim();
}

export function parsePageToBlocks(
  html: string,
  sourceUrl: string,
  pageTitle: string,
): ParsedBlock[] {
  const { document } = parseHTML(html);
  const reader = new Readability(document as unknown as Document);
  const article = reader.parse();

  if (!article?.textContent || article.textContent.trim().length < 50) {
    return [];
  }

  const title = cleanText(article.title || pageTitle);
  const fullText = cleanText(article.textContent);

  const sections = fullText
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30);

  if (sections.length === 0) {
    return [{ content: fullText, title, sourceUrl }];
  }

  // Group sections into blocks of ~350 chars to match IG post length
  const blocks: ParsedBlock[] = [];
  let current = "";

  for (const section of sections) {
    if (current.length + section.length + 2 > 350 && current.length > 0) {
      blocks.push({ content: current.trim(), title, sourceUrl });
      current = section;
    } else {
      current = current ? `${current}\n\n${section}` : section;
    }
  }

  if (current.trim().length >= 30) {
    blocks.push({ content: current.trim(), title, sourceUrl });
  }

  return blocks;
}

export function parsePages(pages: ScrapedPage[]): ParsedBlock[] {
  return pages.flatMap((page) => {
    const blocks = parsePageToBlocks(page.html, page.url, page.title);
    process.stdout.write(
      `  parsed ${blocks.length} blocks from: ${page.title}\n`,
    );
    return blocks;
  });
}
