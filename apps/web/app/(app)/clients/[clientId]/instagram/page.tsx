"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Instagram, AlertTriangle } from "lucide-react";

type ConnectionStatus = {
  connected: boolean;
  igUsername: string | null;
  expiresAt: string | null;
};

export default function InstagramPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const connected = searchParams.get("connected");
  const error = searchParams.get("error");

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/v1/clients/${clientId}/instagram/status`);
      if (res.ok) {
        setStatus((await res.json()) as ConnectionStatus);
      }
      setLoading(false);
    })();
  }, [clientId, connected]);

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Instagram</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Connect this client's Instagram Business account to publish content
          directly.
        </p>
      </div>

      {connected === "1" && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Instagram connected successfully.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Connection failed: {decodeURIComponent(error)}
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Checking connection…</p>
      ) : status?.connected ? (
        <div className="space-y-3 rounded-md border p-4">
          <div className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-pink-500" />
            <span className="font-medium">@{status.igUsername}</span>
            <Badge className="bg-green-100 text-green-700">Connected</Badge>
          </div>
          {status.expiresAt && (
            <p className="text-xs text-muted-foreground">
              Token expires: {new Date(status.expiresAt).toLocaleDateString()}
            </p>
          )}
          <a href={`/api/v1/clients/${clientId}/instagram/connect`}>
            <Button variant="outline" size="sm">
              Reconnect
            </Button>
          </a>
        </div>
      ) : (
        <div className="space-y-3 rounded-md border p-4">
          <p className="text-sm text-muted-foreground">
            No Instagram account connected. You'll need a Facebook account with
            admin access to the client's Instagram Business account.
          </p>
          <a href={`/api/v1/clients/${clientId}/instagram/connect`}>
            <Button className="gap-2">
              <Instagram className="h-4 w-4" />
              Connect Instagram
            </Button>
          </a>
        </div>
      )}

      <div className="space-y-2 rounded-md border p-4">
        <h2 className="text-sm font-medium">Required permissions</h2>
        <ul className="list-disc space-y-1 pl-4 text-sm text-muted-foreground">
          <li>instagram_basic</li>
          <li>instagram_content_publish</li>
          <li>instagram_manage_insights</li>
          <li>pages_show_list</li>
        </ul>
        <p className="text-xs text-muted-foreground">
          The account must be an Instagram Business or Creator account linked to
          a Facebook Page.
        </p>
      </div>
    </div>
  );
}
