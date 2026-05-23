import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { drafts, draftStatusHistory } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId, userId } = auth;
  const { draftId } = await params;

  const [existing] = await db
    .select({ status: drafts.status })
    .from(drafts)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.id, draftId),
        isNull(drafts.deletedAt),
      ),
    );

  if (!existing) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const [updated] = await db
    .update(drafts)
    .set({ status: "ready_for_client" })
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.id, draftId),
        isNull(drafts.deletedAt),
      ),
    )
    .returning({ id: drafts.id });

  if (!updated) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  await db.insert(draftStatusHistory).values({
    draftId,
    workspaceId,
    fromStatus: existing.status,
    toStatus: "ready_for_client",
    changedBy: userId,
  });

  return NextResponse.json({ ok: true });
}
