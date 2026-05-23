"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Link from "next/link";

type DraftRow = {
  id: string;
  hook: string;
  format: string | null;
  status: string;
};

type RepurposeState = {
  format: string;
  loading: boolean;
  error: string | null;
};

const FORMATS = [
  "psychoeducation",
  "normalization",
  "coping_skill",
  "story",
  "cta",
] as const;

const STATUS_COLORS: Record<string, string> = {
  approved: "bg-green-100 text-green-700",
  published: "bg-emerald-100 text-emerald-700",
};

export default function RepurposePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [repurposeStates, setRepurposeStates] = useState<
    Record<string, RepurposeState>
  >({});

  const fetchDrafts = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/v1/clients/${clientId}/drafts`);
    if (res.ok) {
      const data = (await res.json()) as { drafts: DraftRow[] };
      const eligible = data.drafts.filter(
        (d) => d.status === "approved" || d.status === "published",
      );
      setDrafts(eligible);
      setRepurposeStates(
        Object.fromEntries(
          eligible.map((d) => [
            d.id,
            { format: "", loading: false, error: null },
          ]),
        ),
      );
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    void fetchDrafts();
  }, [fetchDrafts]);

  function setDraftFormat(draftId: string, format: string) {
    setRepurposeStates((prev) => ({
      ...prev,
      [draftId]: { ...prev[draftId]!, format, error: null },
    }));
  }

  async function handleRepurpose(draftId: string) {
    const state = repurposeStates[draftId];
    if (!state?.format) return;

    setRepurposeStates((prev) => ({
      ...prev,
      [draftId]: { ...prev[draftId]!, loading: true, error: null },
    }));

    const res = await fetch(
      `/api/v1/clients/${clientId}/drafts/${draftId}/repurpose`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetFormat: state.format }),
      },
    );

    if (res.ok) {
      const data = (await res.json()) as { draft: { id: string } };
      router.push(`/clients/${clientId}/drafts/${data.draft.id}`);
    } else {
      setRepurposeStates((prev) => ({
        ...prev,
        [draftId]: {
          ...prev[draftId]!,
          loading: false,
          error: "Repurpose failed. Please try again.",
        },
      }));
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}/calendar`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Calendar
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">Repurpose Content</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Pick an approved or published draft and generate a new format from
            it.
          </p>
        </div>
      </div>

      {loading && (
        <p className="text-sm text-muted-foreground">Loading drafts…</p>
      )}

      {!loading && drafts.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No approved or published drafts found for this client.
        </p>
      )}

      {!loading && drafts.length > 0 && (
        <div className="space-y-3">
          {drafts.map((draft) => {
            const state = repurposeStates[draft.id];
            return (
              <div key={draft.id} className="rounded-md border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium line-clamp-2">
                    {draft.hook}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    {draft.format && (
                      <Badge variant="outline" className="text-xs capitalize">
                        {draft.format.replace(/_/g, " ")}
                      </Badge>
                    )}
                    <Badge
                      className={`text-xs ${STATUS_COLORS[draft.status] ?? "bg-gray-100 text-gray-700"}`}
                    >
                      {draft.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <select
                    value={state?.format ?? ""}
                    onChange={(e) => setDraftFormat(draft.id, e.target.value)}
                    className="flex h-9 w-52 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="">Choose format…</option>
                    {FORMATS.map((f) => (
                      <option key={f} value={f}>
                        {f.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRepurpose(draft.id)}
                    disabled={!state?.format || state.loading}
                    className="gap-2"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {state?.loading ? "Repurposing…" : "Repurpose"}
                  </Button>
                  <Link
                    href={`/clients/${clientId}/drafts/${draft.id}`}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    View draft
                  </Link>
                </div>

                {state?.error && (
                  <Alert variant="destructive">
                    <AlertDescription>{state.error}</AlertDescription>
                  </Alert>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
