import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { instagramTokens } from "@smm/db/schema";
import { workspaceFilter, and, eq } from "@smm/db/rls";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const [token] = await db
    .select({
      igUsername: instagramTokens.igUsername,
      expiresAt: instagramTokens.expiresAt,
    })
    .from(instagramTokens)
    .where(
      and(
        workspaceFilter(instagramTokens.workspaceId, workspaceId),
        eq(instagramTokens.clientId, clientId),
      ),
    );

  return NextResponse.json({
    connected: !!token,
    igUsername: token?.igUsername ?? null,
    expiresAt: token?.expiresAt ?? null,
  });
}
