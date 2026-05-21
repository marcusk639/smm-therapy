import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@smm/db/client";
import { drafts } from "@smm/db/schema";
import { eq, and, isNull, inArray } from "drizzle-orm";

export async function GET() {
  const clientId = await getPortalSession();
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await db
    .select()
    .from(drafts)
    .where(
      and(
        eq(drafts.clientId, clientId),
        isNull(drafts.deletedAt),
        inArray(drafts.status, [
          "ready_for_client",
          "client_reviewing",
          "approved",
          "changes_requested",
          "scheduled",
          "published",
        ]),
      ),
    )
    .orderBy(drafts.scheduledAt);

  return NextResponse.json({ drafts: rows });
}
