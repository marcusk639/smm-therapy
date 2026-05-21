"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
import Link from "next/link";

type DraftRow = {
  id: string;
  hook: string;
  caption: string;
  hashtags: string[];
  format: string | null;
  status: string;
  complianceApproved: boolean;
  scheduledAt: string | null;
};

const DRAFT_STATUSES = [
  "draft",
  "ready_for_client",
  "client_reviewing",
  "approved",
  "changes_requested",
  "scheduled",
  "published",
] as const;

const FORMATS = [
  "psychoeducation",
  "normalization",
  "coping_skill",
  "story",
  "cta",
] as const;

export default function DraftDetailPage() {
  const { clientId, draftId } = useParams<{
    clientId: string;
    draftId: string;
  }>();
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [hook, setHook] = useState("");
  const [caption, setCaption] = useState("");
  const [status, setStatus] = useState("draft");
  const [repurposeFormat, setRepurposeFormat] = useState("");
  const [saving, setSaving] = useState(false);
  const [repurposing, setRepurposing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/v1/clients/${clientId}/drafts/${draftId}`);
      if (res.ok) {
        const data = (await res.json()) as { draft: DraftRow };
        setDraft(data.draft);
        setHook(data.draft.hook);
        setCaption(data.draft.caption);
        setStatus(data.draft.status);
      }
    })();
  }, [clientId, draftId]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/v1/clients/${clientId}/drafts/${draftId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hook, caption, status }),
    });
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      const data = (await res.json()) as { error: string };
      setError(typeof data.error === "string" ? data.error : "Save failed");
    }
    setSaving(false);
  }

  async function handleRepurpose() {
    if (!repurposeFormat) return;
    setRepurposing(true);
    const res = await fetch(
      `/api/v1/clients/${clientId}/drafts/${draftId}/repurpose`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetFormat: repurposeFormat }),
      },
    );
    if (res.ok) {
      const data = (await res.json()) as { draft: { id: string } };
      window.location.href = `/clients/${clientId}/drafts/${data.draft.id}`;
    } else {
      setError("Repurpose failed");
      setRepurposing(false);
    }
  }

  if (!draft) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/clients/${clientId}/calendar`}>
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Calendar
          </Button>
        </Link>
        <Badge
          className={
            draft.complianceApproved
              ? "bg-green-100 text-green-700"
              : "bg-amber-100 text-amber-700"
          }
        >
          {draft.complianceApproved ? "Compliant" : "Compliance review needed"}
        </Badge>
      </div>

      <div className="space-y-4">
        <div className="space-y-1">
          <Label>Hook</Label>
          <Textarea
            value={hook}
            onChange={(e) => setHook(e.target.value)}
            rows={2}
          />
        </div>

        <div className="space-y-1">
          <Label>Caption</Label>
          <Textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={8}
          />
        </div>

        <div className="w-56 space-y-1">
          <Label>Status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DRAFT_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {saved && (
          <Alert>
            <AlertDescription>Saved.</AlertDescription>
          </Alert>
        )}

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      <div className="rounded-md border p-4 space-y-3">
        <h2 className="text-sm font-medium">Repurpose as another format</h2>
        <div className="flex gap-2">
          <Select value={repurposeFormat} onValueChange={setRepurposeFormat}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder="Choose format" />
            </SelectTrigger>
            <SelectContent>
              {FORMATS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={handleRepurpose}
            disabled={!repurposeFormat || repurposing}
            className="gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            {repurposing ? "Repurposing…" : "Repurpose"}
          </Button>
        </div>
      </div>
    </div>
  );
}
