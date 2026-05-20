import { auth } from "@clerk/nextjs/server";
import { db } from "@smm/db/client";
import { workspaces } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

/**
 * Call this at the top of every authenticated API route.
 * Returns the workspace UUID (Neon) for the current Clerk org.
 * Returns a 401/400 NextResponse if auth fails.
 */
export async function requireWorkspace(): Promise<
  { workspaceId: string; userId: string } | NextResponse
> {
  const { userId, orgId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!orgId) {
    return NextResponse.json(
      { error: "No workspace selected. Create or join an organization." },
      { status: 400 },
    );
  }

  const [workspace] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.clerkOrgId, orgId));

  if (!workspace) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  return { workspaceId: workspace.id, userId };
}
