import { countTokens } from "../utils";
import type { Chunk } from "./types";

export function singleChunk(
  posts: string[],
  metadata: Record<string, unknown> = {},
): Chunk[] {
  return posts.map((post, i) => {
    const content = post.trim();
    return {
      content,
      chunkIndex: i,
      tokenCount: countTokens(content),
      metadata: { ...metadata },
    };
  });
}
