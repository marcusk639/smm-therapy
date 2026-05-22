import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { trendTopics } from "@smm/db/schema";
import { eq, and, gte } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const result = await requireWorkspace();
  if (result instanceof NextResponse) return result;
  const { workspaceId } = result;

  const weeksParam = req.nextUrl.searchParams.get("weeks");
  const weeks = Math.min(parseInt(weeksParam ?? "4", 10), 12);

  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - weeks * 7);
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  const trends = await db
    .select()
    .from(trendTopics)
    .where(
      and(
        eq(trendTopics.workspaceId, workspaceId),
        gte(trendTopics.weekOf, cutoffDate),
      ),
    )
    .orderBy(trendTopics.weekOf, trendTopics.relevanceScore);

  return NextResponse.json({ trends });
}
