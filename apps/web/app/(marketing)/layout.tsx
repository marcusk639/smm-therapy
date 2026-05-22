import type { ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <Link href="/" className="font-semibold text-lg">
          TherapyContent
        </Link>
        <div className="flex items-center gap-3">
          <Link href="/sign-in">
            <Button variant="ghost" size="sm">
              Sign in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t px-6 py-8 text-center text-sm text-muted-foreground">
        © 2026 TherapyContent. Built for licensed mental health professionals.
      </footer>
    </div>
  );
}
