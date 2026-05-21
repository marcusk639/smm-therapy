"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, MessageSquare, ArrowLeft } from "lucide-react";
import Link from "next/link";

type DraftRow = {
  id: string;
  hook: string;
  caption: string;
  hashtags: string[];
  status: string;
};

type CommentRow = {
  id: string;
  authorType: string;
  authorName: string;
  body: string;
  createdAt: string;
};

export default function PortalDraftPage() {
  const { clientSlug, draftId } = useParams<{
    clientSlug: string;
    draftId: string;
  }>();
  const [draft, setDraft] = useState<DraftRow | null>(null);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState("");
  const [feedback, setFeedback] = useState("");
  const [actionDone, setActionDone] = useState<
    "approved" | "changes_requested" | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([
      fetch(`/api/portal/drafts/${draftId}`).then(async (r) => {
        if (r.ok) setDraft(((await r.json()) as { draft: DraftRow }).draft);
      }),
      fetch(`/api/portal/drafts/${draftId}/comments`).then(async (r) => {
        if (r.ok)
          setComments(
            ((await r.json()) as { comments: CommentRow[] }).comments,
          );
      }),
    ]);
  }, [draftId]);

  async function handleApprove() {
    setLoading(true);
    const res = await fetch(`/api/portal/drafts/${draftId}/approve`, {
      method: "POST",
    });
    if (res.ok) {
      setActionDone("approved");
    } else {
      setError("Could not approve. Please try again.");
    }
    setLoading(false);
  }

  async function handleRequestChanges() {
    if (!feedback.trim()) {
      setError("Please describe the changes needed.");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/portal/drafts/${draftId}/request-changes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: feedback }),
    });
    if (res.ok) {
      setActionDone("changes_requested");
    } else {
      setError("Could not submit feedback. Please try again.");
    }
    setLoading(false);
  }

  async function handleAddComment() {
    if (!commentText.trim()) return;
    const res = await fetch(`/api/portal/drafts/${draftId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: commentText }),
    });
    if (res.ok) {
      const data = (await res.json()) as { comment: CommentRow };
      setComments((prev) => [...prev, data.comment]);
      setCommentText("");
    }
  }

  if (!draft) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <Link href={`/portal/${clientSlug}`}>
        <Button variant="ghost" size="sm" className="gap-1">
          <ArrowLeft className="h-4 w-4" /> All content
        </Button>
      </Link>

      {actionDone === "approved" && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Approved! Your feedback has been recorded.
          </AlertDescription>
        </Alert>
      )}
      {actionDone === "changes_requested" && (
        <Alert>
          <AlertDescription>
            Changes requested. Your team has been notified.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4 rounded-md border bg-white p-5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-medium">{draft.hook}</h2>
          <Badge>{draft.status.replace(/_/g, " ")}</Badge>
        </div>
        <p className="whitespace-pre-wrap text-sm">{draft.caption}</p>
        {draft.hashtags.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {draft.hashtags.map((h) => `#${h}`).join(" ")}
          </p>
        )}
      </div>

      {!actionDone && draft.status === "ready_for_client" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <Button
              onClick={handleApprove}
              disabled={loading}
              className="flex-1 bg-green-600 hover:bg-green-700"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              Approve
            </Button>
          </div>

          <div className="space-y-2">
            <Textarea
              placeholder="What would you like changed?"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
            />
            <Button
              variant="outline"
              onClick={handleRequestChanges}
              disabled={loading || !feedback.trim()}
              className="w-full"
            >
              Request Changes
            </Button>
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      )}

      <div className="space-y-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="h-4 w-4" />
          Comments ({comments.length})
        </h3>
        {comments.map((c) => (
          <div key={c.id} className="rounded-md border bg-white p-3 text-sm">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-medium">{c.authorName}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(c.createdAt).toLocaleString()}
              </span>
            </div>
            <p>{c.body}</p>
          </div>
        ))}
        <div className="flex gap-2">
          <Textarea
            placeholder="Add a comment…"
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={2}
            className="flex-1"
          />
          <Button
            variant="outline"
            onClick={handleAddComment}
            disabled={!commentText.trim()}
          >
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}
