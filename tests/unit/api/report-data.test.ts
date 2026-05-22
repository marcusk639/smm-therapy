import { describe, it, expect } from "vitest";
import { buildReportData } from "../../../apps/web/app/api/v1/clients/[clientId]/reports/[month]/report-data";

describe("buildReportData", () => {
  it("counts published drafts", () => {
    const data = buildReportData(
      [
        { status: "published", format: "story", complianceApproved: true },
        { status: "approved", format: "cta", complianceApproved: true },
        { status: "published", format: "cta", complianceApproved: false },
      ],
      "2026-06",
    );
    expect(data.publishedCount).toBe(2);
    expect(data.approvedCount).toBe(1);
  });

  it("counts changes_requested drafts", () => {
    const data = buildReportData(
      [
        {
          status: "changes_requested",
          format: "story",
          complianceApproved: false,
        },
        { status: "published", format: "story", complianceApproved: true },
      ],
      "2026-06",
    );
    expect(data.changesRequestedCount).toBe(1);
  });

  it("builds format breakdown", () => {
    const data = buildReportData(
      [
        { status: "published", format: "story", complianceApproved: true },
        { status: "published", format: "story", complianceApproved: true },
        { status: "published", format: "cta", complianceApproved: true },
      ],
      "2026-06",
    );
    expect(data.formatBreakdown["story"]).toBe(2);
    expect(data.formatBreakdown["cta"]).toBe(1);
  });

  it("calculates compliance rate", () => {
    const data = buildReportData(
      [
        { status: "published", format: "story", complianceApproved: true },
        { status: "published", format: "story", complianceApproved: false },
      ],
      "2026-06",
    );
    expect(data.complianceRate).toBe(50);
  });

  it("returns 100% compliance rate when no drafts", () => {
    const data = buildReportData([], "2026-06");
    expect(data.complianceRate).toBe(100);
  });

  it("sums engagement metrics when provided", () => {
    const data = buildReportData(
      [{ status: "published", format: "cta", complianceApproved: true }],
      "2026-06",
      [
        { impressions: 1000, reach: 800, likes: 50, comments: 10, shares: 5 },
        { impressions: 500, reach: 400, likes: 20, comments: 3, shares: 2 },
      ],
    );
    expect(data.totalImpressions).toBe(1500);
    expect(data.totalReach).toBe(1200);
    expect(data.totalLikes).toBe(70);
  });

  it("returns zero engagement totals when no metrics provided", () => {
    const data = buildReportData(
      [{ status: "published", format: "cta", complianceApproved: true }],
      "2026-06",
    );
    expect(data.totalImpressions).toBe(0);
    expect(data.totalShares).toBe(0);
  });
});
