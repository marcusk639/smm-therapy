import { inngest } from "../client";
import { db } from "@smm/db/client";
import { drafts, instagramTokens, postMetrics } from "@smm/db/schema";
import { eq, isNotNull, and } from "drizzle-orm";
import { decrypt } from "@smm/crypto";
import { parseMetricsResponse, type MetricsRaw } from "./ig-metrics-utils";

export { parseMetricsResponse };

async function fetchMetrics(
  igMediaId: string,
  accessToken: string,
): Promise<MetricsRaw> {
  const fields = "reach,impressions,likes,comments,saved,shares";
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${igMediaId}/insights?metric=${fields}&access_token=${accessToken}`,
  );
  if (!res.ok) throw new Error(`Metrics fetch failed: ${res.status}`);
  return res.json() as Promise<MetricsRaw>;
}

export const igMetricsSync = inngest.createFunction(
  { id: "ig-metrics-sync", retries: 2 },
  { cron: "0 6 * * *" },
  async ({ step }) => {
    const publishedDrafts = await step.run("fetch-published-drafts", () =>
      db
        .select({
          id: drafts.id,
          clientId: drafts.clientId,
          workspaceId: drafts.workspaceId,
          igMediaId: drafts.igMediaId,
        })
        .from(drafts)
        .where(
          and(eq(drafts.status, "published"), isNotNull(drafts.igMediaId)),
        ),
    );

    if (publishedDrafts.length === 0) return { synced: 0 };

    const tokenMap = new Map<string, string>();

    for (const draft of publishedDrafts) {
      if (!draft.igMediaId) continue;

      const clientId = draft.clientId;
      if (!tokenMap.has(clientId)) {
        const [tokenRow] = await db
          .select()
          .from(instagramTokens)
          .where(eq(instagramTokens.clientId, clientId));
        if (!tokenRow) continue;
        tokenMap.set(
          clientId,
          decrypt(tokenRow.encryptedToken, process.env.INSTAGRAM_TOKEN_KEY!),
        );
      }

      const accessToken = tokenMap.get(clientId)!;

      await step.run(`sync-metrics-${draft.id}`, async () => {
        try {
          const raw = await fetchMetrics(draft.igMediaId!, accessToken);
          const metrics = parseMetricsResponse(raw);
          await db.insert(postMetrics).values({
            draftId: draft.id,
            clientId: draft.clientId,
            workspaceId: draft.workspaceId,
            igMediaId: draft.igMediaId!,
            ...metrics,
          });
        } catch {
          // Skip drafts that fail metrics fetch — they'll retry next cron run
        }
      });
    }

    return { synced: publishedDrafts.length };
  },
);
