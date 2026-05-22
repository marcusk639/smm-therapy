type DraftSummary = {
  status: string;
  format: string | null;
  complianceApproved: boolean;
};

export type PostMetricsSummary = {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

export type ReportData = {
  month: string;
  publishedCount: number;
  approvedCount: number;
  changesRequestedCount: number;
  formatBreakdown: Record<string, number>;
  complianceRate: number;
  totalImpressions: number;
  totalReach: number;
  totalLikes: number;
  totalComments: number;
  totalShares: number;
};

export function buildReportData(
  drafts: DraftSummary[],
  month: string,
  metrics?: PostMetricsSummary[],
): ReportData {
  const publishedCount = drafts.filter((d) => d.status === "published").length;
  const approvedCount = drafts.filter((d) => d.status === "approved").length;
  const changesRequestedCount = drafts.filter(
    (d) => d.status === "changes_requested",
  ).length;

  const formatBreakdown: Record<string, number> = {};
  for (const d of drafts) {
    const fmt = d.format ?? "unknown";
    formatBreakdown[fmt] = (formatBreakdown[fmt] ?? 0) + 1;
  }

  const compliantCount = drafts.filter((d) => d.complianceApproved).length;
  const complianceRate =
    drafts.length > 0
      ? Math.round((compliantCount / drafts.length) * 100)
      : 100;

  const sum = (field: keyof PostMetricsSummary) =>
    (metrics ?? []).reduce((acc, m) => acc + (m[field] ?? 0), 0);

  return {
    month,
    publishedCount,
    approvedCount,
    changesRequestedCount,
    formatBreakdown,
    complianceRate,
    totalImpressions: sum("impressions"),
    totalReach: sum("reach"),
    totalLikes: sum("likes"),
    totalComments: sum("comments"),
    totalShares: sum("shares"),
  };
}
