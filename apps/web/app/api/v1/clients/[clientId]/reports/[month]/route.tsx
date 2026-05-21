import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, drafts } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { gte, lte } from "drizzle-orm";
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import { buildReportData } from "./report-data";

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

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; month: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, month } = await params;

  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const [year, mo] = month.split("-").map(Number) as [number, number];
  const start = new Date(year, mo - 1, 1);
  const end = new Date(year, mo, 0, 23, 59, 59);

  const draftRows = await db
    .select({
      status: drafts.status,
      format: drafts.format,
      complianceApproved: drafts.complianceApproved,
    })
    .from(drafts)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.clientId, clientId),
        isNull(drafts.deletedAt),
        gte(drafts.scheduledAt, start),
        lte(drafts.scheduledAt, end),
      ),
    );

  const data = buildReportData(draftRows, month);

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

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="report-${client.slug}-${month}.pdf"`,
    },
  });
}
