"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RefreshCw, Plus, AlertTriangle } from "lucide-react";

type Document = {
  id: string;
  title: string;
  sourceType: string;
  status: string;
  failedStage: string | null;
  failedReason: string | null;
  createdAt: string;
};

type KnowledgeBase = {
  id: string;
  name: string;
};

const FAILURE_MESSAGES: Record<string, string> = {
  fetch: "Could not fetch content from the source.",
  parse: "Could not read this file. Try re-exporting as PDF/A.",
  chunk: "Content could not be split into chunks.",
  embed: "Embedding failed — API rate limit. Will retry automatically.",
  store: "Could not save chunks to database.",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-700",
  fetching: "bg-blue-100 text-blue-700",
  parsing: "bg-blue-100 text-blue-700",
  chunking: "bg-blue-100 text-blue-700",
  embedding: "bg-blue-100 text-blue-700",
  storing: "bg-blue-100 text-blue-700",
  complete: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
};

type DriveStatus =
  | { connected: false }
  | { connected: true; accountEmail: string | null };

export default function KnowledgePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [selectedKbId, setSelectedKbId] = useState<string | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveStatus | null>(null);

  const fetchDriveStatus = useCallback(async () => {
    const res = await fetch("/api/v1/workspace/google-drive/status");
    if (res.ok) setDriveStatus((await res.json()) as DriveStatus);
  }, []);

  useEffect(() => {
    void fetchDriveStatus();
  }, [fetchDriveStatus]);

  const fetchKbs = useCallback(async () => {
    const res = await fetch(`/api/v1/clients/${clientId}/knowledge-bases`);
    if (res.ok) {
      const data = (await res.json()) as { knowledgeBases: KnowledgeBase[] };
      setKbs(data.knowledgeBases);
      if (data.knowledgeBases.length > 0 && !selectedKbId) {
        setSelectedKbId(data.knowledgeBases[0]!.id);
      }
    }
  }, [clientId, selectedKbId]);

  const fetchDocs = useCallback(async () => {
    if (!selectedKbId) return;
    setLoading(true);
    const res = await fetch(
      `/api/v1/clients/${clientId}/knowledge-bases/${selectedKbId}/documents`,
    );
    if (res.ok) {
      const data = (await res.json()) as { documents: Document[] };
      setDocs(data.documents);
    }
    setLoading(false);
  }, [clientId, selectedKbId]);

  useEffect(() => {
    void fetchKbs();
  }, [fetchKbs]);
  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  async function retryDocument(docId: string) {
    if (!selectedKbId) return;
    await fetch(
      `/api/v1/clients/${clientId}/knowledge-bases/${selectedKbId}/documents/${docId}/retry`,
      { method: "POST" },
    );
    void fetchDocs();
  }

  async function createKb() {
    const name = window.prompt("Knowledge base name:");
    if (!name) return;
    const res = await fetch(`/api/v1/clients/${clientId}/knowledge-bases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) void fetchKbs();
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Knowledge Base</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Documents ingested for RAG-powered generation.
          </p>
        </div>
        <Button onClick={createKb} size="sm" className="gap-2">
          <Plus className="h-4 w-4" /> New Knowledge Base
        </Button>
      </div>

      {driveStatus && (
        <div className="flex items-center justify-between rounded-md border bg-muted/30 p-3 text-sm">
          <div>
            <p className="font-medium">Google Drive</p>
            <p className="text-xs text-muted-foreground">
              {driveStatus.connected
                ? `Connected${driveStatus.accountEmail ? ` as ${driveStatus.accountEmail}` : ""}.`
                : "Not connected — connect to ingest from a Drive folder."}
            </p>
          </div>
          <Button
            variant={driveStatus.connected ? "outline" : "default"}
            size="sm"
            onClick={() => {
              const returnTo = window.location.pathname;
              window.location.href = `/api/v1/workspace/google-drive/connect?returnTo=${encodeURIComponent(returnTo)}`;
            }}
          >
            {driveStatus.connected ? "Reconnect" : "Connect Google Drive"}
          </Button>
        </div>
      )}

      {kbs.length === 0 && (
        <Alert>
          <AlertDescription>
            No knowledge bases yet. Create one to start adding documents.
          </AlertDescription>
        </Alert>
      )}

      {kbs.length > 0 && (
        <div className="flex gap-2">
          {kbs.map((kb) => (
            <Button
              key={kb.id}
              variant={selectedKbId === kb.id ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedKbId(kb.id)}
            >
              {kb.name}
            </Button>
          ))}
        </div>
      )}

      {selectedKbId && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Documents</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchDocs}
              className="gap-1"
            >
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>

          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {!loading && docs.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No documents yet. Use the API to ingest content.
            </p>
          )}

          {docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-start justify-between rounded-md border p-3"
            >
              <div className="space-y-1">
                <p className="text-sm font-medium">{doc.title}</p>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_COLORS[doc.status] ?? ""}`}
                  >
                    {doc.status}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {doc.sourceType}
                  </span>
                </div>
                {doc.status === "failed" && (
                  <div className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" />
                    {doc.failedStage
                      ? (FAILURE_MESSAGES[doc.failedStage] ??
                        doc.failedReason ??
                        "Unknown error")
                      : (doc.failedReason ?? "Unknown error")}
                  </div>
                )}
              </div>
              {doc.status === "failed" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => retryDocument(doc.id)}
                >
                  Retry
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
