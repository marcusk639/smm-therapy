"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ComplianceBadge } from "@/components/compliance-badge";
import { AlertTriangle, Zap } from "lucide-react";
import Link from "next/link";

type Violation = {
  ruleId: string;
  offendingExcerpt: string;
  explanation: string;
  severity: "critical" | "warning";
  sourceCitation: string;
};

type CrisisResource = {
  topicKey: string;
  resourceText: string;
  hotline: string | null;
};

type GenerateHooksResult = {
  hooks: string[];
  auditId: string;
  compliance: {
    violations: Violation[];
    approved: boolean;
    rulesVersion: string;
  };
  crisis: {
    triggered: boolean;
    score: number;
    resources: CrisisResource[];
  };
  cacheHit: boolean;
};

export default function GenerateHooksPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [topic, setTopic] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateHooksResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedHooks, setSelectedHooks] = useState<Set<number>>(new Set());

  async function handleGenerate() {
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setSelectedHooks(new Set());

    try {
      const res = await fetch(`/api/v1/clients/${clientId}/generate/hooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Generation failed");
        return;
      }
      const data = (await res.json()) as GenerateHooksResult;
      setResult(data);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  function toggleHook(index: number) {
    setSelectedHooks((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const selectedHookTexts = result
    ? Array.from(selectedHooks).map((i) => result.hooks[i]!)
    : [];

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Generate Hooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter a topic to generate 15 hook options for your client&apos;s
          Instagram.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="topic">Topic</Label>
        <Textarea
          id="topic"
          placeholder="e.g., managing anxiety at work, setting boundaries with family, recognizing burnout"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          rows={2}
        />
      </div>

      <Button
        onClick={handleGenerate}
        disabled={!topic.trim() || loading}
        className="gap-2"
      >
        <Zap className="h-4 w-4" />
        {loading ? "Generating…" : "Generate Hooks"}
      </Button>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {result && (
        <div className="space-y-4">
          {result.crisis.triggered && (
            <Alert className="border-amber-500 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                <strong>Crisis resources required.</strong> This topic involves
                crisis-adjacent content. The following resources will be
                appended to any published post:
                <ul className="mt-2 list-disc pl-4 text-sm">
                  {result.crisis.resources.map((r) => (
                    <li key={r.topicKey}>{r.hotline ?? r.resourceText}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              {result.hooks.length} hooks generated
            </h2>
            <div className="flex items-center gap-2">
              <ComplianceBadge
                violations={result.compliance.violations}
                approved={result.compliance.approved}
              />
              {result.cacheHit && (
                <span className="text-xs text-muted-foreground">
                  ⚡ Cache hit
                </span>
              )}
            </div>
          </div>

          {result.compliance.violations.length > 0 && (
            <Alert variant="destructive">
              <AlertDescription>
                <strong>Compliance violations detected:</strong>
                <ul className="mt-2 list-disc pl-4 text-sm">
                  {result.compliance.violations.map((v, i) => (
                    <li key={i}>
                      &ldquo;{v.offendingExcerpt}&rdquo; — {v.explanation} (
                      {v.sourceCitation})
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            {result.hooks.map((hook, i) => (
              <label
                key={i}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 hover:bg-accent"
              >
                <Checkbox
                  checked={selectedHooks.has(i)}
                  onCheckedChange={() => toggleHook(i)}
                  className="mt-0.5"
                />
                <span className="text-sm">{hook}</span>
              </label>
            ))}
          </div>

          {selectedHooks.size > 0 && (
            <Link
              href={`/clients/${clientId}/generate/captions?hooks=${encodeURIComponent(JSON.stringify(selectedHookTexts))}&topic=${encodeURIComponent(topic)}&auditId=${result.auditId}`}
            >
              <Button className="w-full">
                Generate Captions for {selectedHooks.size} selected hook
                {selectedHooks.size > 1 ? "s" : ""}
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
