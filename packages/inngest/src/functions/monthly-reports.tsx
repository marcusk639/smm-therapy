import { inngest } from "../client";
import { db } from "@smm/db/client";
import { clients, drafts, postMetrics, magicLinkTokens } from "@smm/db/schema";
import { eq, isNull, and, isNotNull, gte, lte, desc } from "drizzle-orm";
import { Resend } from "resend";
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";

const resend = new Resend(process.env.RESEND_API_KEY!);

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica" },
  title: { fontSize: 20, fontWeight: "bold", marginBottom: 8 },
  subtitle: { fontSize: 12, color: "#666", marginBottom: 24 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "bold", marginBottom: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  label: { fontSize: 11, color: "#444" },
  value: { fontSize: 11, fontWeight: "bold" },
});

type DraftSummary = {
  status: string;
  format: string | null;
  complianceApproved: boolean;
};

type PostMetricsSummary = {
  impressions: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
};

type ReportData = {
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

function buildReportData(
  draftRows: DraftSummary[],
  month: string,
  metrics?: PostMetricsSummary[],
): ReportData {
  const publishedCount = draftRows.filter(
    (d) => d.status === "published",
  ).length;
  const approvedCount = draftRows.filter((d) => d.status === "approved").length;
  const changesRequestedCount = draftRows.filter(
    (d) => d.status === "changes_requested",
  ).length;

  const formatBreakdown: Record<string, number> = {};
  for (const d of draftRows) {
    const fmt = d.format ?? "unknown";
    formatBreakdown[fmt] = (formatBreakdown[fmt] ?? 0) + 1;
  }

  const compliantCount = draftRows.filter((d) => d.complianceApproved).length;
  const complianceRate =
    draftRows.length > 0
      ? Math.round((compliantCount / draftRows.length) * 100)
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

function previousMonth(now: Date): string {
  const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const mo = now.getMonth() === 0 ? 12 : now.getMonth();
  return `${year}-${String(mo).padStart(2, "0")}`;
}

export const monthlyReports = inngest.createFunction(
  { id: "monthly-reports", retries: 2 },
  { cron: "0 8 1 * *" },
  async ({ step }) => {
    const month = previousMonth(new Date());
    const [year, mo] = month.split("-").map(Number) as [number, number];
    const start = new Date(year, mo - 1, 1);
    const end = new Date(year, mo, 0, 23, 59, 59);

    const activeClients = await step.run("fetch-active-clients", () =>
      db
        .selectDistinctOn([clients.id], {
          id: clients.id,
          workspaceId: clients.workspaceId,
          name: clients.name,
          slug: clients.slug,
          email: magicLinkTokens.email,
        })
        .from(clients)
        .innerJoin(magicLinkTokens, eq(magicLinkTokens.clientId, clients.id))
        .where(and(isNull(clients.deletedAt), isNotNull(magicLinkTokens.email)))
        .orderBy(clients.id, desc(magicLinkTokens.createdAt)),
    );

    if (activeClients.length === 0) return { sent: 0, month };

    let sent = 0;

    for (const client of activeClients) {
      if (!client.email) continue;

      await step.run(`send-report-${client.id}`, async () => {
        const draftRows = await db
          .select({
            status: drafts.status,
            format: drafts.format,
            complianceApproved: drafts.complianceApproved,
          })
          .from(drafts)
          .where(
            and(
              eq(drafts.clientId, client.id),
              isNull(drafts.deletedAt),
              gte(drafts.scheduledAt, start),
              lte(drafts.scheduledAt, end),
            ),
          );

        const metricRows = await db
          .select({
            impressions: postMetrics.impressions,
            reach: postMetrics.reach,
            likes: postMetrics.likes,
            comments: postMetrics.comments,
            shares: postMetrics.shares,
          })
          .from(postMetrics)
          .where(
            and(
              eq(postMetrics.clientId, client.id),
              gte(postMetrics.recordedAt, start),
              lte(postMetrics.recordedAt, end),
            ),
          );

        const data = buildReportData(draftRows, month, metricRows);

        const pdf = await renderToBuffer(
          <Document>
            <Page size="A4" style={styles.page}>
              <Text style={styles.title}>Monthly Content Report</Text>
              <Text style={styles.subtitle}>
                {client.name} — {month}
              </Text>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Summary</Text>
                <View style={styles.row}>
                  <Text style={styles.label}>Published</Text>
                  <Text style={styles.value}>{data.publishedCount}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Approved (pending publish)</Text>
                  <Text style={styles.value}>{data.approvedCount}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Changes requested</Text>
                  <Text style={styles.value}>{data.changesRequestedCount}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Compliance pass rate</Text>
                  <Text style={styles.value}>{data.complianceRate}%</Text>
                </View>
              </View>

              {data.totalImpressions + data.totalReach > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Engagement</Text>
                  <View style={styles.row}>
                    <Text style={styles.label}>Impressions</Text>
                    <Text style={styles.value}>
                      {data.totalImpressions.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Reach</Text>
                    <Text style={styles.value}>
                      {data.totalReach.toLocaleString()}
                    </Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Likes</Text>
                    <Text style={styles.value}>{data.totalLikes}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Comments</Text>
                    <Text style={styles.value}>{data.totalComments}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Shares</Text>
                    <Text style={styles.value}>{data.totalShares}</Text>
                  </View>
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Format Breakdown</Text>
                {Object.entries(data.formatBreakdown).map(([fmt, cnt]) => (
                  <View key={fmt} style={styles.row}>
                    <Text style={styles.label}>{fmt.replace(/_/g, " ")}</Text>
                    <Text style={styles.value}>{cnt}</Text>
                  </View>
                ))}
              </View>
            </Page>
          </Document>,
        );

        await resend.emails.send({
          from: "noreply@yourdomain.com",
          to: client.email,
          subject: `Monthly Content Report — ${client.name} — ${month}`,
          html: `<p>Hi ${client.name},</p><p>Please find your monthly content report attached.</p>`,
          attachments: [
            {
              filename: `report-${client.slug}-${month}.pdf`,
              content: pdf,
              contentType: "application/pdf",
            },
          ],
        });
      });

      sent += 1;
    }

    return { sent, month };
  },
);
