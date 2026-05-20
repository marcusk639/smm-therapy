"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Mic2 } from "lucide-react";

type BrandVoiceProfile = {
  tone: number;
  vocabularyLevel: "plain" | "mixed" | "clinical";
  disclosureLevel: "minimal" | "moderate" | "personal";
  preferredStructures: string[];
  avoidPhrases: string[];
  examplePhrases: string[];
};

type BrandVoiceData = {
  id: string;
  profile: BrandVoiceProfile;
  updatedAt: string;
} | null;

export default function BrandVoicePage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [samplePosts, setSamplePosts] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [profile, setProfile] = useState<BrandVoiceData>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchExisting();
  }, [clientId]);

  async function fetchExisting() {
    setFetching(true);
    try {
      const res = await fetch(`/api/v1/clients/${clientId}/brand-voice`);
      if (res.ok) {
        const data = (await res.json()) as { brandVoice: BrandVoiceData };
        setProfile(data.brandVoice);
      }
    } finally {
      setFetching(false);
    }
  }

  async function handleExtract() {
    const posts = samplePosts
      .split("\n---\n")
      .map((p) => p.trim())
      .filter((p) => p.length >= 10);

    if (posts.length < 3) {
      setError("Paste at least 3 posts, separated by --- on its own line");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/v1/clients/${clientId}/brand-voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samplePosts: posts }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Extraction failed");
        return;
      }
      const data = (await res.json()) as { brandVoice: BrandVoiceData };
      setProfile(data.brandVoice);
      setSamplePosts("");
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Brand Voice Profile</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste sample Instagram posts to extract this client&apos;s voice
          profile. Separate posts with{" "}
          <code className="rounded bg-muted px-1 text-xs">---</code> on its own
          line.
        </p>
      </div>

      {!fetching && profile && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Mic2 className="h-4 w-4" />
              Current Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Tone: {profile.profile.tone}/10</Badge>
              <Badge variant="outline">
                Vocabulary: {profile.profile.vocabularyLevel}
              </Badge>
              <Badge variant="outline">
                Disclosure: {profile.profile.disclosureLevel}
              </Badge>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">
                Preferred structures
              </p>
              <ul className="mt-1 list-disc pl-4">
                {profile.profile.preferredStructures.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">Avoid phrases</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {profile.profile.avoidPhrases.map((p) => (
                  <Badge key={p} variant="secondary" className="text-xs">
                    {p}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="font-medium text-muted-foreground">
                Example phrases
              </p>
              <ul className="mt-1 list-disc pl-4">
                {profile.profile.examplePhrases.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <Label htmlFor="sample-posts">
          Sample Posts (paste 3–30 posts, separated by ---)
        </Label>
        <Textarea
          id="sample-posts"
          placeholder={
            "Post 1 text here...\n---\nPost 2 text here...\n---\nPost 3 text here..."
          }
          value={samplePosts}
          onChange={(e) => setSamplePosts(e.target.value)}
          rows={10}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button
        onClick={handleExtract}
        disabled={!samplePosts.trim() || loading}
        className="gap-2"
      >
        <Mic2 className="h-4 w-4" />
        {loading
          ? "Extracting…"
          : profile
            ? "Update Voice Profile"
            : "Extract Voice Profile"}
      </Button>
    </div>
  );
}
