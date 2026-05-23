"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, CreditCard, Zap } from "lucide-react";

type BillingStatus = {
  plan: "starter" | "growth" | "agency";
  hasSubscription: boolean;
  currentPeriodEnd: string | null;
};

const PLAN_FEATURES: Record<string, string[]> = {
  starter: ["1 client", "Hook + caption generation", "Knowledge base"],
  growth: [
    "5 clients",
    "Calendar generation",
    "Trend digest",
    "Multi-client dashboard",
  ],
  agency: [
    "Unlimited clients",
    "Everything in Growth",
    "Instagram publishing",
    "API access",
  ],
};

const PLAN_PRICES: Record<string, string> = {
  starter: "Free",
  growth: "$99/mo",
  agency: "$299/mo",
};

export default function BillingPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const success = searchParams.get("success");
  const canceled = searchParams.get("canceled");

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/v1/billing/status");
      if (res.ok) setStatus((await res.json()) as BillingStatus);
    })();
  }, [success]);

  async function handleUpgrade(plan: "growth" | "agency") {
    setLoading(true);
    const res = await fetch("/api/v1/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan }),
    });
    if (res.ok) {
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    }
    setLoading(false);
  }

  async function handleManage() {
    setLoading(true);
    const res = await fetch("/api/v1/billing/portal", { method: "POST" });
    if (res.ok) {
      const data = (await res.json()) as { url: string };
      window.location.href = data.url;
    }
    setLoading(false);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage your subscription and plan.
        </p>
      </div>

      {success === "1" && (
        <Alert className="border-green-500 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Subscription activated. Your plan has been updated.
          </AlertDescription>
        </Alert>
      )}
      {canceled === "1" && (
        <Alert>
          <AlertDescription>
            Checkout canceled. No charges were made.
          </AlertDescription>
        </Alert>
      )}

      {status && (
        <div className="rounded-md border p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Current plan</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className="capitalize">{status.plan}</Badge>
              <span className="text-sm text-muted-foreground">
                {PLAN_PRICES[status.plan]}
              </span>
            </div>
            {status.currentPeriodEnd && (
              <p className="text-xs text-muted-foreground mt-1">
                Renews {new Date(status.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
          {status.hasSubscription && (
            <Button variant="outline" onClick={handleManage} disabled={loading}>
              <CreditCard className="mr-2 h-4 w-4" />
              Manage billing
            </Button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(["starter", "growth", "agency"] as const).map((plan) => {
          const isCurrent = status?.plan === plan;
          return (
            <div
              key={plan}
              className={`rounded-md border p-4 space-y-3 ${
                isCurrent ? "border-primary bg-primary/5" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold capitalize">{plan}</p>
                <span className="text-sm font-medium">{PLAN_PRICES[plan]}</span>
              </div>
              <ul className="space-y-1">
                {PLAN_FEATURES[plan]!.map((f) => (
                  <li key={f} className="text-xs text-muted-foreground">
                    • {f}
                  </li>
                ))}
              </ul>
              {!isCurrent && plan !== "starter" && (
                <Button
                  className="w-full gap-2"
                  size="sm"
                  onClick={() => handleUpgrade(plan)}
                  disabled={loading}
                >
                  <Zap className="h-3 w-3" />
                  Upgrade
                </Button>
              )}
              {isCurrent && (
                <Badge variant="outline" className="w-full justify-center">
                  Current plan
                </Badge>
              )}
            </div>
          );
        })}
      </div>

      <div>
        <h2 className="text-lg font-semibold">Data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Download all your workspace data as JSON.
        </p>
        <div className="mt-3">
          <a href="/api/v1/workspace/export" download>
            <Button variant="outline">Export all data</Button>
          </a>
        </div>
      </div>
    </div>
  );
}
