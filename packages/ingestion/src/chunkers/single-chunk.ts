import { countTokens } from "../utils";
import type { Chunk } from "./types";

export function singleChunk(
  posts: string[],
  metadata: Record<string, unknown> = {},
): Chunk[] {
  return posts.map((post, i) => ({
    content: post.trim(),
    chunkIndex: i,
    tokenCount: countTokens(post),
    metadata,
  }));
}
