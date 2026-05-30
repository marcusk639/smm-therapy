import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { db } from "@smm/db/client";
import { clients, workspaces } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { count } from "drizzle-orm";

/**
 * Onboarding (setup) is for first-time workspace setup only. If the workspace
 * already has any client, the wizard would create a second "first client" on
 * re-entry — so redirect those users straight to /dashboard. New clients are
 * added via the in-app clients UI.
 */
export default async function OnboardingLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { orgId } = await auth();
  if (orgId) {
    const [workspace] = await db
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.clerkOrgId, orgId));
    if (workspace) {
      const [{ value: clientCount }] = await db
        .select({ value: count() })
        .from(clients)
        .where(
          and(
            workspaceFilter(clients.workspaceId, workspace.id),
            isNull(clients.deletedAt),
          ),
        );
      if (clientCount > 0) {
        redirect("/dashboard");
      }
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
