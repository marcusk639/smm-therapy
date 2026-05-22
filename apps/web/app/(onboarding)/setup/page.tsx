"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle } from "lucide-react";

type Step = "workspace" | "client" | "knowledge_base" | "done";

const STEPS: Step[] = ["workspace", "client", "knowledge_base", "done"];

const STEP_LABELS: Record<Step, string> = {
  workspace: "Name your workspace",
  client: "Add your first client",
  knowledge_base: "Create a knowledge base",
  done: "You're all set",
};

export default function SetupPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("workspace");
  const [wsName, setWsName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientSlug, setClientSlug] = useState("");
  const [kbName, setKbName] = useState("Main Knowledge Base");
  const [clientId, setClientId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = STEPS.indexOf(step);

  async function handleWorkspace() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/v1/workspace/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: wsName }),
    });
    if (res.ok) {
      setStep("client");
    } else {
      const data = (await res.json()) as { error: string };
      setError(typeof data.error === "string" ? data.error : "Setup failed");
    }
    setLoading(false);
  }

  async function handleClient() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/v1/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: clientName, slug: clientSlug }),
    });
    if (res.ok) {
      const data = (await res.json()) as { client: { id: string } };
      setClientId(data.client.id);
      setStep("knowledge_base");
    } else {
      const data = (await res.json()) as { error: string };
      setError(
        typeof data.error === "string" ? data.error : "Client creation failed",
      );
    }
    setLoading(false);
  }

  async function handleKnowledgeBase() {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/v1/clients/${clientId}/knowledge-bases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: kbName }),
    });
    if (res.ok) {
      setStep("done");
    } else {
      setError("Knowledge base creation failed");
    }
    setLoading(false);
  }

  if (step === "done") {
    return (
      <div className="space-y-6 text-center">
        <CheckCircle className="mx-auto h-12 w-12 text-green-500" />
        <div>
          <h1 className="text-2xl font-semibold">You&apos;re all set!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your workspace, first client, and knowledge base are ready.
          </p>
        </div>
        <Button className="w-full" onClick={() => router.push("/dashboard")}>
          Go to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex gap-1 mb-4">
          {STEPS.slice(0, -1).map((s, i) => (
            <div
              key={s}
              className={`h-1.5 flex-1 rounded-full transition ${
                i < stepIndex ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <h1 className="text-xl font-semibold">{STEP_LABELS[step]}</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Step {stepIndex + 1} of {STEPS.length - 1}
        </p>
      </div>

      {step === "workspace" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="wsname">Workspace name</Label>
            <Input
              id="wsname"
              placeholder="e.g., Sunrise Therapy Practice"
              value={wsName}
              onChange={(e) => setWsName(e.target.value)}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            className="w-full"
            disabled={!wsName.trim() || loading}
            onClick={handleWorkspace}
          >
            {loading ? "Saving…" : "Continue"}
          </Button>
        </div>
      )}

      {step === "client" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cname">Client name</Label>
            <Input
              id="cname"
              placeholder="e.g., Dr. Sarah Chen"
              value={clientName}
              onChange={(e) => {
                setClientName(e.target.value);
                setClientSlug(
                  e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                );
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cslug">URL slug</Label>
            <Input
              id="cslug"
              value={clientSlug}
              onChange={(e) => setClientSlug(e.target.value)}
              placeholder="dr-sarah-chen"
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            className="w-full"
            disabled={!clientName.trim() || !clientSlug.trim() || loading}
            onClick={handleClient}
          >
            {loading ? "Saving…" : "Continue"}
          </Button>
        </div>
      )}

      {step === "knowledge_base" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A knowledge base stores documents and content your client has shared
            — used to ground generated content in their voice.
          </p>
          <div className="space-y-1">
            <Label htmlFor="kbname">Knowledge base name</Label>
            <Input
              id="kbname"
              value={kbName}
              onChange={(e) => setKbName(e.target.value)}
            />
          </div>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Button
            className="w-full"
            disabled={!kbName.trim() || loading}
            onClick={handleKnowledgeBase}
          >
            {loading ? "Creating…" : "Finish setup"}
          </Button>
        </div>
      )}
    </div>
  );
}
