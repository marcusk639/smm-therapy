export type MetricsRaw = {
  data: Array<{
    name: string;
    values: Array<{ value: number }>;
  }>;
};

export function parseMetricsResponse(raw: MetricsRaw): {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
} {
  const get = (name: string) =>
    raw.data.find((d) => d.name === name)?.values[0]?.value ?? 0;
  return {
    reach: get("reach"),
    impressions: get("impressions"),
    likes: get("likes"),
    comments: get("comments"),
    saves: get("saved"),
    shares: get("shares"),
  };
}
