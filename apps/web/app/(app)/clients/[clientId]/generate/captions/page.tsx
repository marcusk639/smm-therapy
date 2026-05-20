"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ComplianceBadge } from "@/components/compliance-badge";
import {
  BookOpen,
  Heart,
  Lightbulb,
  BookMarked,
  MousePointer,
} from "lucide-react";

type Violation = {
  ruleId: string;
  offendingExcerpt: string;
  explanation: string;
  severity: "critical" | "warning";
  sourceCitation: string;
};

type CaptionResult = {
  format: string;
  caption: string;
  hashtags: string[];
  compliance: { violations: Violation[]; approved: boolean };
  cacheHit: boolean;
};

const FORMAT_ICONS: Record<string, React.ReactNode> = {
  psychoeducation: <BookOpen className="h-4 w-4" />,
  normalization: <Heart className="h-4 w-4" />,
  coping_skill: <Lightbulb className="h-4 w-4" />,
  story: <BookMarked className="h-4 w-4" />,
  cta: <MousePointer className="h-4 w-4" />,
};

const FORMAT_LABELS: Record<string, string> = {
  psychoeducation: "Psychoeducation",
  normalization: "Normalization",
  coping_skill: "Coping Skill",
  story: "Story",
  cta: "CTA",
};

export default function GenerateCaptionsPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const searchParams = useSearchParams();
  const [captions, setCaptions] = useState<CaptionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editedCaptions, setEditedCaptions] = useState<Record<string, string>>(
    {},
  );
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  const hooksParam = searchParams.get("hooks");
  const topic = searchParams.get("topic") ?? "";
  const auditId = searchParams.get("auditId");
  const hooks: string[] = hooksParam
    ? (JSON.parse(hooksParam) as string[])
    : [];
  const selectedHook = hooks[0] ?? "";

  useEffect(() => {
    if (!selectedHook) return;
    void generateCaptions(selectedHook);
  }, [selectedHook]);

  async function generateCaptions(hook: string) {
    setLoading(true);
    setError(null);
    setCaptions([]);

    try {
      const res = await fetch(`/api/v1/clients/${clientId}/generate/captions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedHook: hook,
          topic,
          formats: [
            "psychoeducation",
            "normalization",
            "coping_skill",
            "story",
            "cta",
          ],
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Generation failed");
        return;
      }
      const data = (await res.json()) as { captions: CaptionResult[] };
      setCaptions(data.captions);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  function getCaptionText(format: string, original: string) {
    return editedCaptions[format] ?? original;
  }

  async function saveDraft(captionResult: CaptionResult) {
    const captionText = getCaptionText(
      captionResult.format,
      captionResult.caption,
    );
    const res = await fetch(`/api/v1/clients/${clientId}/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hook: selectedHook,
        caption: captionText,
        hashtags: captionResult.hashtags,
        format: captionResult.format,
        generationAuditId: auditId,
        requiresCrisisResources: false,
      }),
    });
    if (res.ok) {
      setSaved((prev) => ({ ...prev, [captionResult.format]: true }));
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Generated Captions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Hook: <em>&ldquo;{selectedHook}&rdquo;</em>
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      )}

      {captions.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {captions.map((c) => (
            <div
              key={c.format}
              className="flex flex-col gap-3 rounded-lg border p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {FORMAT_ICONS[c.format]}
                  {FORMAT_LABELS[c.format] ?? c.format}
                </div>
                <ComplianceBadge
                  violations={c.compliance.violations}
                  approved={c.compliance.approved}
                />
              </div>

              <Textarea
                value={getCaptionText(c.format, c.caption)}
                onChange={(e) =>
                  setEditedCaptions((prev) => ({
                    ...prev,
                    [c.format]: e.target.value,
                  }))
                }
                rows={8}
                className="text-sm"
              />

              {c.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.hashtags.map((h) => (
                    <Badge key={h} variant="secondary" className="text-xs">
                      {h}
                    </Badge>
                  ))}
                </div>
              )}

              {c.compliance.violations.length > 0 && (
                <Alert variant="destructive" className="py-2">
                  <AlertDescription className="text-xs">
                    {c.compliance.violations[0]!.explanation}
                  </AlertDescription>
                </Alert>
              )}

              <Button
                variant={saved[c.format] ? "outline" : "default"}
                size="sm"
                onClick={() => saveDraft(c)}
                disabled={saved[c.format]}
              >
                {saved[c.format] ? "Saved ✓" : "Save Draft"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
