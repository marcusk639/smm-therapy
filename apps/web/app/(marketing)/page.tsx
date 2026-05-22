import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Zap, Shield, Instagram, TrendingUp } from "lucide-react";

const FEATURES = [
  {
    icon: Zap,
    title: "AI-powered content",
    description:
      "Generate 15 hooks and full captions in seconds — grounded in your client's knowledge base.",
  },
  {
    icon: Shield,
    title: "Compliance built in",
    description:
      "Every piece of content is checked against your state's licensure rules before you see it.",
  },
  {
    icon: Instagram,
    title: "Publish directly",
    description:
      "Approved drafts go live on Instagram with one click. No copy-paste.",
  },
  {
    icon: TrendingUp,
    title: "Weekly trending topics",
    description:
      "Surface what's being discussed in mental health communities every Monday morning.",
  },
];

const PRICING = [
  {
    plan: "Starter",
    price: "Free",
    description: "Try it with one client",
    features: ["1 client", "Hook + caption generation", "Compliance checker"],
    cta: "Start free",
    href: "/sign-up",
    highlight: false,
  },
  {
    plan: "Growth",
    price: "$99/mo",
    description: "For active SMM practices",
    features: [
      "5 clients",
      "Calendar generation",
      "Client approval portal",
      "Weekly trend digest",
    ],
    cta: "Start Growth",
    href: "/sign-up?plan=growth",
    highlight: true,
  },
  {
    plan: "Agency",
    price: "$299/mo",
    description: "For full-service agencies",
    features: [
      "Unlimited clients",
      "Instagram publishing",
      "API access",
      "Priority support",
    ],
    cta: "Start Agency",
    href: "/sign-up?plan=agency",
    highlight: false,
  },
];

export default function LandingPage() {
  return (
    <div>
      <section className="max-w-3xl mx-auto px-6 py-24 text-center space-y-6">
        <Badge className="text-sm">Built for therapist SMMs</Badge>
        <h1 className="text-5xl font-bold tracking-tight leading-tight">
          Compliant Instagram content
          <br />
          for mental health practices
        </h1>
        <p className="text-xl text-muted-foreground max-w-xl mx-auto">
          Generate, review, and publish therapy-informed social media content
          that never violates your state&apos;s licensure rules.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/sign-up">
            <Button size="lg" className="gap-2">
              <Zap className="h-4 w-4" />
              Start free
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button size="lg" variant="outline">
              Sign in
            </Button>
          </Link>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-semibold text-center mb-10">
          Everything a therapy SMM needs
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-md border p-5 space-y-2">
              <div className="flex items-center gap-2">
                <f.icon className="h-5 w-5 text-primary" />
                <h3 className="font-medium">{f.title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-semibold text-center mb-10">
          Simple pricing
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {PRICING.map((p) => (
            <div
              key={p.plan}
              className={`rounded-md border p-5 space-y-4 ${
                p.highlight ? "border-primary shadow-md" : ""
              }`}
            >
              {p.highlight && <Badge className="text-xs">Most popular</Badge>}
              <div>
                <h3 className="font-semibold text-lg">{p.plan}</h3>
                <div className="flex items-baseline gap-1 mt-1">
                  <span className="text-2xl font-bold">{p.price}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {p.description}
                </p>
              </div>
              <ul className="space-y-1.5">
                {p.features.map((f) => (
                  <li key={f} className="text-sm text-muted-foreground">
                    ✓ {f}
                  </li>
                ))}
              </ul>
              <Link href={p.href}>
                <Button
                  className="w-full"
                  variant={p.highlight ? "default" : "outline"}
                >
                  {p.cta}
                </Button>
              </Link>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
