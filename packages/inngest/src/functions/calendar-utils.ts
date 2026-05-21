const FORMATS = [
  "psychoeducation",
  "normalization",
  "coping_skill",
  "story",
  "cta",
] as const;
type Format = (typeof FORMATS)[number];

export function distributeTopics(topics: string[], count: number): string[] {
  return Array.from({ length: count }, (_, i) => topics[i % topics.length]!);
}

export function distributeFormats(count: number): Format[] {
  return Array.from({ length: count }, (_, i) => FORMATS[i % FORMATS.length]!);
}

export function getScheduledDates(
  month: string,
  count: number,
  postsPerWeek: number,
): Date[] {
  const [year, mo] = month.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(year, mo, 0).getDate();
  const intervalDays = Math.max(1, Math.floor(7 / postsPerWeek));
  const dates: Date[] = [];
  let day = 1;
  while (dates.length < count && day <= daysInMonth) {
    dates.push(new Date(year, mo - 1, day));
    day += intervalDays;
  }
  return dates;
}
