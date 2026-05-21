"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

type DraftRow = {
  id: string;
  hook: string;
  status: string;
  scheduledAt: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  ready_for_client: "Awaiting your review",
  client_reviewing: "In review",
  approved: "Approved",
  changes_requested: "Changes requested",
  scheduled: "Scheduled",
  published: "Published",
};

export default function PortalHomePage() {
  const { clientSlug } = useParams<{ clientSlug: string }>();
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/portal/drafts?slug=${clientSlug}`);
      if (res.ok) {
        const data = (await res.json()) as { drafts: DraftRow[] };
        setDrafts(data.drafts);
      } else if (res.status === 401) {
        setDrafts(null);
      }
    })();
  }, [clientSlug]);

  async function handleSendLink() {
    setSending(true);
    await fetch("/api/portal/auth/magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, clientSlug }),
    });
    setSent(true);
    setSending(false);
  }

  if (drafts !== null) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Your Content</h1>
        {drafts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No drafts ready for review yet.
          </p>
        )}
        {drafts.map((d) => (
          <Link
            key={d.id}
            href={`/portal/${clientSlug}/draft/${d.id}`}
            className="block rounded-md border bg-white p-4 transition hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium">{d.hook}</p>
              <Badge className="shrink-0 text-xs">
                {STATUS_LABELS[d.status] ?? d.status}
              </Badge>
            </div>
            {d.scheduledAt && (
              <p className="mt-1 text-xs text-muted-foreground">
                {new Date(d.scheduledAt).toLocaleDateString()}
              </p>
            )}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Content Review</h1>

      {error === "expired" && (
        <Alert variant="destructive">
          <AlertDescription>
            This link has expired or already been used. Request a new one below.
          </AlertDescription>
        </Alert>
      )}

      {sent ? (
        <Alert>
          <AlertDescription>
            Check your email — a sign-in link is on its way. It expires in 15
            minutes.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-3 rounded-md border bg-white p-6">
          <p className="text-sm text-muted-foreground">
            Enter your email address to receive a one-time sign-in link.
          </p>
          <div className="space-y-1">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <Button
            onClick={handleSendLink}
            disabled={!email || sending}
            className="w-full"
          >
            {sending ? "Sending…" : "Send sign-in link"}
          </Button>
        </div>
      )}
    </div>
  );
}
