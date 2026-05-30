import { inngest } from "../client";
import { db } from "@smm/db/client";
import { drafts, instagramTokens, postMetrics } from "@smm/db/schema";
import { workspaceFilter, and, eq } from "@smm/db/rls";
import { isNull, isNotNull } from "drizzle-orm";
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
          and(
            eq(drafts.status, "published"),
            isNotNull(drafts.igMediaId),
            isNotNull(drafts.workspaceId),
            isNull(drafts.deletedAt),
          ),
        ),
    );

    if (publishedDrafts.length === 0) return { synced: 0 };

    // Token cache key combines workspaceId + clientId so we never reuse a
    // token across workspaces (defense-in-depth even though clientIds are UUIDs).
    const tokenMap = new Map<string, string>();

    for (const draft of publishedDrafts) {
      if (!draft.igMediaId || !draft.workspaceId) continue;

      const cacheKey = `${draft.workspaceId}:${draft.clientId}`;
      if (!tokenMap.has(cacheKey)) {
        const [tokenRow] = await db
          .select()
          .from(instagramTokens)
          .where(
            and(
              workspaceFilter(instagramTokens.workspaceId, draft.workspaceId),
              eq(instagramTokens.clientId, draft.clientId),
            ),
          );
        if (!tokenRow) continue;
        const igTokenKey = process.env.INSTAGRAM_TOKEN_KEY;
        if (!igTokenKey)
          throw new Error("INSTAGRAM_TOKEN_KEY is not configured");
        tokenMap.set(cacheKey, decrypt(tokenRow.encryptedToken, igTokenKey));
      }

      const accessToken = tokenMap.get(cacheKey)!;

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
        } catch (err) {
          // Per-draft failures (expired token, throttled API, deleted media)
          // are surfaced via step logs so the Inngest dashboard catches them.
          console.warn(
            `[ig-metrics-sync] draft ${draft.id} sync failed:`,
            err instanceof Error ? err.message : err,
          );
        }
      });
    }

    return { synced: publishedDrafts.length };
  },
);
