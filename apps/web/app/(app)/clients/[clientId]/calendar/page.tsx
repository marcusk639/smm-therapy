"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Zap } from "lucide-react";
import Link from "next/link";

type DraftRow = {
  id: string;
  hook: string;
  status: string;
  scheduledAt: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  ready_for_client: "bg-blue-100 text-blue-700",
  client_reviewing: "bg-yellow-100 text-yellow-700",
  approved: "bg-green-100 text-green-700",
  changes_requested: "bg-red-100 text-red-700",
  scheduled: "bg-purple-100 text-purple-700",
  published: "bg-emerald-100 text-emerald-700",
};

function getMonthDays(month: string): Date[] {
  const [year, mo] = month.split("-").map(Number) as [number, number];
  const count = new Date(year, mo, 0).getDate();
  return Array.from({ length: count }, (_, i) => new Date(year, mo - 1, i + 1));
}

export default function CalendarPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [topics, setTopics] = useState("anxiety, burnout, boundaries");
  const [postsPerWeek, setPostsPerWeek] = useState(5);
  const [jobId, setJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    const res = await fetch(
      `/api/v1/clients/${clientId}/calendar?month=${month}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { drafts: DraftRow[] };
      setDrafts(data.drafts);
    }
    setLoading(false);
  }, [clientId, month]);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    const res = await fetch(`/api/v1/clients/${clientId}/calendar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month,
        topicAreas: topics
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        postsPerWeek,
      }),
    });
    if (res.ok) {
      const data = (await res.json()) as { jobId: string };
      setJobId(data.jobId);
      setTimeout(() => {
        void fetchDrafts();
        setGenerating(false);
      }, 8000);
    } else {
      const data = (await res.json()) as { error: string };
      setError(
        typeof data.error === "string" ? data.error : "Generation failed",
      );
      setGenerating(false);
    }
  }

  const days = getMonthDays(month);
  const byDate = drafts.reduce<Record<string, DraftRow[]>>((acc, d) => {
    if (!d.scheduledAt) return acc;
    const key = d.scheduledAt.slice(0, 10);
    acc[key] = [...(acc[key] ?? []), d];
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Content Calendar</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate a full month of posts in one click.
          </p>
        </div>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-36"
        />
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <h2 className="text-sm font-medium">Generate Calendar</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-48 space-y-1">
            <Label htmlFor="topics">Topics (comma-separated)</Label>
            <Input
              id="topics"
              value={topics}
              onChange={(e) => setTopics(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ppw">Posts / week</Label>
            <Input
              id="ppw"
              type="number"
              min={1}
              max={7}
              value={postsPerWeek}
              onChange={(e) => setPostsPerWeek(Number(e.target.value))}
              className="w-20"
            />
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="gap-2"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            {generating ? "Generating…" : "Generate"}
          </Button>
        </div>
        {jobId && !error && (
          <p className="text-xs text-muted-foreground">
            Job {jobId.slice(0, 8)}… queued. Drafts appear as the job runs.
          </p>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
      </div>

      <div className="grid grid-cols-7 gap-px text-xs font-medium text-muted-foreground">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="p-2 text-center">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-px border rounded-md overflow-hidden bg-border">
        {Array.from({ length: days[0]!.getDay() }).map((_, i) => (
          <div key={`pad-${i}`} className="min-h-20 bg-background" />
        ))}
        {days.map((day) => {
          const key = day.toISOString().slice(0, 10);
          const dayDrafts = byDate[key] ?? [];
          return (
            <div key={key} className="min-h-20 bg-background p-1 text-xs">
              <div className="font-medium text-muted-foreground mb-1">
                {day.getDate()}
              </div>
              {!loading && (
                <>
                  {dayDrafts.map((d) => (
                    <Link
                      key={d.id}
                      href={`/clients/${clientId}/drafts/${d.id}`}
                      className="block mb-0.5 truncate rounded px-1 py-0.5 hover:bg-accent"
                    >
                      <span
                        className={`mr-1 rounded px-1 ${STATUS_COLORS[d.status] ?? ""}`}
                      >
                        {d.status.replace(/_/g, " ")}
                      </span>
                      <span className="text-muted-foreground">{d.hook}</span>
                    </Link>
                  ))}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
