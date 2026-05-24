import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import {
  drafts,
  draftStatusHistory,
  clients,
  magicLinkTokens,
} from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq, desc } from "@smm/db/rls";
import { sendReviewRequestEmail } from "@smm/notifications";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId, userId } = auth;
  const { clientId, draftId } = await params;

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

  try {
    const [client] = await db
      .select({ name: clients.name, slug: clients.slug })
      .from(clients)
      .where(eq(clients.id, clientId));

    if (client) {
      const [tokenRow] = await db
        .select({ email: magicLinkTokens.email })
        .from(magicLinkTokens)
        .where(eq(magicLinkTokens.clientId, clientId))
        .orderBy(desc(magicLinkTokens.createdAt))
        .limit(1);

      if (tokenRow?.email) {
        const reviewUrl = `${process.env.NEXT_PUBLIC_APP_URL}/portal/${client.slug}`;
        await sendReviewRequestEmail(tokenRow.email, client.name, 1, reviewUrl);
      }
    }
  } catch {
    // Email failure must not cause the route to 500 — status already updated
  }

  return NextResponse.json({ ok: true });
}
