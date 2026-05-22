import { countTokens, splitAtTokenBoundary } from "../utils";
import type { Chunk } from "./types";

const MIN_TOKENS = 50;
const MAX_TOKENS = 800;

export function recursiveChunk(
  text: string,
  metadata: Record<string, unknown> = {},
): Chunk[] {
  const { segments, sep } = splitRecursive(text.trim());
  const merged = mergeSmall(segments, sep);

  return merged.map((content, i) => ({
    content,
    chunkIndex: i,
    tokenCount: countTokens(content),
    metadata: { ...metadata },
  }));
}

function splitRecursive(text: string): { segments: string[]; sep: string } {
  const separators = ["\n\n", "\n", ". ", " "];
  for (const sep of separators) {
    const parts = text
      .split(sep)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.every((p) => countTokens(p) <= MAX_TOKENS))
      return { segments: parts, sep };
  }
  return { segments: splitAtTokenBoundary(text, MAX_TOKENS), sep: "" };
}

function mergeSmall(segments: string[], sep: string): string[] {
  // Paragraph-level splits (\n\n) should not be merged — each paragraph is a chunk
  if (sep === "\n\n") {
    return segments.flatMap((seg) =>
      countTokens(seg) > MAX_TOKENS
        ? splitAtTokenBoundary(seg, MAX_TOKENS)
        : [seg],
    );
  }

  const merged: string[] = [];
  let current = "";

  for (const seg of segments) {
    if (!current) {
      current = seg;
      continue;
    }
    const combined = `${current}\n\n${seg}`;
    if (
      countTokens(current) < MIN_TOKENS &&
      countTokens(combined) <= MAX_TOKENS
    ) {
      current = combined;
    } else if (countTokens(seg) > MAX_TOKENS) {
      if (current) merged.push(current);
      splitAtTokenBoundary(seg, MAX_TOKENS).forEach((p) => merged.push(p));
      current = "";
    } else {
      if (current) merged.push(current);
      current = seg;
    }
  }

  if (current) {
    if (merged.length > 0 && countTokens(current) < MIN_TOKENS) {
      const last = merged[merged.length - 1]!;
      merged.splice(merged.length - 1, 1, `${last}\n\n${current}`);
    } else {
      merged.push(current);
    }
  }

  return merged;
}
