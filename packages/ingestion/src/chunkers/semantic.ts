import { embed, cosineSimilarity } from "@smm/ai/embeddings";
import { countTokens, splitAtTokenBoundary } from "../utils";
import type { Chunk } from "./types";

const WINDOW_TOKENS = 512;
const MIN_TOKENS = 200;
const MAX_TOKENS = 800;
const SIMILARITY_THRESHOLD = 0.65;
const EMBED_BATCH = 96;
const WINDOW_WORDS = Math.floor((WINDOW_TOKENS * 4) / 5); // ~410 words per window
const STRIDE_WORDS = Math.floor(WINDOW_WORDS * 0.8);

function splitIntoWindows(text: string): string[] {
  const words = text.split(/\s+/);
  const windowWords = WINDOW_WORDS;
  const strideWords = STRIDE_WORDS;
  const windows: string[] = [];

  for (let i = 0; i < words.length; i += strideWords) {
    const window = words.slice(i, i + windowWords).join(" ");
    if (window.trim()) windows.push(window);
    if (i + windowWords >= words.length) break;
  }
  return windows;
}

async function embedBatched(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const batchEmbeddings = await embed(batch);
    results.push(...batchEmbeddings);
  }
  return results;
}

export async function semanticChunk(
  text: string,
  metadata: Record<string, unknown> = {},
): Promise<Chunk[]> {
  const windows = splitIntoWindows(text);
  if (windows.length <= 1) {
    const parts =
      countTokens(text) > MAX_TOKENS
        ? splitAtTokenBoundary(text, MAX_TOKENS)
        : [text];
    return parts.map((content, i) => ({
      content,
      chunkIndex: i,
      tokenCount: countTokens(content),
      metadata: { ...metadata },
    }));
  }

  const embeddings = await embedBatched(windows);

  // Find chunk boundaries: where similarity between consecutive windows drops below threshold
  const boundaries: number[] = [0];
  for (let i = 0; i < embeddings.length - 1; i++) {
    const sim = cosineSimilarity(embeddings[i]!, embeddings[i + 1]!);
    if (sim < SIMILARITY_THRESHOLD) {
      boundaries.push(i + 1);
    }
  }
  boundaries.push(windows.length);

  // Build raw segments from boundaries
  const words = text.split(/\s+/);

  const rawSegments: string[] = [];
  for (let b = 0; b < boundaries.length - 1; b++) {
    const startWindow = boundaries[b]!;
    const endWindow = boundaries[b + 1]!;
    const startWord = startWindow * STRIDE_WORDS;
    // endWindow is exclusive — last window in segment is (endWindow-1), end at its last word
    const endWord = (endWindow - 1) * STRIDE_WORDS + WINDOW_WORDS;
    rawSegments.push(words.slice(startWord, endWord).join(" ").trim());
  }

  // Merge too-small segments, split too-large ones
  const finalChunks: string[] = [];
  let pending = "";

  for (const seg of rawSegments) {
    const combined = pending ? `${pending} ${seg}` : seg;
    if (countTokens(combined) < MIN_TOKENS) {
      pending = combined;
    } else if (countTokens(combined) <= MAX_TOKENS) {
      finalChunks.push(combined);
      pending = "";
    } else {
      if (pending) finalChunks.push(pending);
      pending = "";
      splitAtTokenBoundary(seg, MAX_TOKENS).forEach((p) => finalChunks.push(p));
    }
  }
  if (pending) {
    finalChunks.push(pending);
  }

  return finalChunks
    .filter((c) => c.trim().length > 0)
    .map((content, i) => ({
      content,
      chunkIndex: i,
      tokenCount: countTokens(content),
      metadata: { ...metadata },
    }));
}
