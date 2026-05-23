import type { ReactNode } from "react";
import { db } from "@smm/db/client";
import { clients } from "@smm/db/schema";
import { eq, isNull, and } from "drizzle-orm";

export default async function PortalLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ clientSlug: string }>;
}) {
  const { clientSlug } = await params;

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.slug, clientSlug), isNull(clients.deletedAt)));

  const displayName =
    client?.practiceName ?? client?.name ?? "Content Review Portal";
  const primaryColor = client?.primaryColor ?? null;
  const logoUrl = client?.logoUrl ?? null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="border-b bg-white px-6 py-4"
        style={primaryColor ? { borderBottomColor: primaryColor } : undefined}
      >
        <div className="flex items-center gap-3">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={displayName}
              className="h-8 w-auto object-contain"
            />
          )}
          <p
            className="text-sm font-medium text-muted-foreground"
            style={primaryColor ? { color: primaryColor } : undefined}
          >
            {displayName}
          </p>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
