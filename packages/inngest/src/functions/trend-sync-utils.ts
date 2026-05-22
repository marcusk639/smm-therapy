export type ScoredPost = {
  text: string;
  score: number;
};

export function filterByRelevance(
  posts: ScoredPost[],
  threshold: number,
): ScoredPost[] {
  return posts.filter((p) => p.score >= threshold);
}

export function buildWeekOf(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}
