import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@smm/db/client";
import { drafts } from "@smm/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const clientId = await getPortalSession();
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { draftId } = await params;
  const [draft] = await db
    .select()
    .from(drafts)
    .where(and(eq(drafts.id, draftId), eq(drafts.clientId, clientId)));

  if (!draft) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ draft });
}
