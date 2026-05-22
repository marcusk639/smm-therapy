/** Fraction of relevant IDs that appear in the top-K retrieved IDs. */
export function recallAtK(
  retrievedIds: string[],
  relevantIds: string[],
  k: number,
): number {
  if (relevantIds.length === 0) return 1.0;
  const topK = new Set(retrievedIds.slice(0, k));
  const hits = relevantIds.filter((id) => topK.has(id)).length;
  return hits / relevantIds.length;
}

/** Mean Reciprocal Rank — 1 / rank_of_first_relevant_result. */
export function mrr(retrievedIds: string[], relevantIds: string[]): number {
  const relevant = new Set(relevantIds);
  for (let i = 0; i < retrievedIds.length; i++) {
    if (relevant.has(retrievedIds[i]!)) return 1 / (i + 1);
  }
  return 0;
}
