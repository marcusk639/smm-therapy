import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@smm/db/client";
import { drafts } from "@smm/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const clientId = await getPortalSession();
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { draftId } = await params;

  const [updated] = await db
    .update(drafts)
    .set({ status: "approved" })
    .where(and(eq(drafts.id, draftId), eq(drafts.clientId, clientId)))
    .returning({ id: drafts.id });

  if (!updated) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
