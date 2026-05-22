import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { trendTopics } from "@smm/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";

async function getTrends(workspaceId: string) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - 28); // 4 weeks
  const cutoffDate = cutoff.toISOString().slice(0, 10);

  return db
    .select()
    .from(trendTopics)
    .where(
      and(
        eq(trendTopics.workspaceId, workspaceId),
        gte(trendTopics.weekOf, cutoffDate),
      ),
    )
    .orderBy(trendTopics.weekOf, trendTopics.relevanceScore);
}

export default async function TrendsPage() {
  const result = await requireWorkspace();
  if (result instanceof (await import("next/server")).NextResponse) {
    redirect("/sign-in");
  }
  const { workspaceId } = result as { workspaceId: string; userId: string };

  const trends = await getTrends(workspaceId);

  // Group by week
  const byWeek = trends.reduce<Record<string, typeof trends>>((acc, t) => {
    (acc[t.weekOf] ??= []).push(t);
    return acc;
  }, {});

  const weeks = Object.keys(byWeek).sort().reverse();

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Trend Digest</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Weekly trending topics from mental health communities — synthesized
          for your content strategy.
        </p>
      </div>

      {weeks.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No trends yet. The weekly sync runs every Monday at 8 AM UTC.
        </p>
      )}

      {weeks.map((week) => (
        <section key={week}>
          <h2 className="mb-3 text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Week of {week}
          </h2>
          <ul className="space-y-3">
            {byWeek[week]
              .sort((a, b) => b.relevanceScore - a.relevanceScore)
              .map((trend) => (
                <li
                  key={trend.id}
                  className="rounded-lg border bg-card p-4 space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">{trend.topic}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {Math.round(trend.relevanceScore * 100)}% relevant
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {trend.summary}
                  </p>
                </li>
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
