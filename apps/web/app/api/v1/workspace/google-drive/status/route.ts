import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { workspaceIntegrations } from "@smm/db/schema";

export async function GET() {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const [row] = await db
    .select({
      accountEmail: workspaceIntegrations.accountEmail,
      expiresAt: workspaceIntegrations.expiresAt,
      scopes: workspaceIntegrations.scopes,
    })
    .from(workspaceIntegrations)
    .where(
      and(
        eq(workspaceIntegrations.workspaceId, workspaceId),
        eq(workspaceIntegrations.provider, "google_drive"),
      ),
    );

  if (!row) return NextResponse.json({ connected: false });

  return NextResponse.json({
    connected: true,
    accountEmail: row.accountEmail,
    expiresAt: row.expiresAt,
    scopes: row.scopes,
  });
}
