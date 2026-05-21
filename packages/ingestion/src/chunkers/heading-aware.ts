import { countTokens, splitAtTokenBoundary } from "../utils";
import type { Chunk } from "./types";

type UnstructuredElement = { type: string; text: string };

const MAX_TOKENS = 800;

export function headingAwareChunk(
  elements: UnstructuredElement[],
  metadata: Record<string, unknown> = {},
): Chunk[] {
  const groups: string[] = [];
  let currentHeading = "";
  let currentBody = "";

  for (const el of elements) {
    if (el.type === "Title") {
      if (currentHeading || currentBody) {
        groups.push([currentHeading, currentBody].filter(Boolean).join("\n\n"));
      }
      currentHeading = el.text;
      currentBody = "";
    } else if (
      el.type === "NarrativeText" ||
      el.type === "ListItem" ||
      el.type === "Table"
    ) {
      currentBody = currentBody ? `${currentBody}\n${el.text}` : el.text;
    }
  }

  if (currentHeading || currentBody) {
    groups.push([currentHeading, currentBody].filter(Boolean).join("\n\n"));
  }

  const finalChunks: string[] = groups.flatMap((g) =>
    countTokens(g) > MAX_TOKENS ? splitAtTokenBoundary(g, MAX_TOKENS) : [g],
  );

  return finalChunks
    .filter((c) => c.trim().length > 0)
    .map((content, i) => ({
      content,
      chunkIndex: i,
      tokenCount: countTokens(content),
      metadata,
    }));
}
