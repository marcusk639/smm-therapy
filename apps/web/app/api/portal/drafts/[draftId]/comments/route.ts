import { NextResponse } from "next/server";
import { getPortalSession } from "@/lib/portal-auth";
import { db } from "@smm/db/client";
import { drafts, draftComments } from "@smm/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { CommentSchema } from "@smm/types/portal";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  const clientId = await getPortalSession();
  if (!clientId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { draftId } = await params;

  const rows = await db
    .select()
    .from(draftComments)
    .where(
      and(
        eq(draftComments.draftId, draftId),
        eq(draftComments.clientId, clientId),
      ),
    )
    .orderBy(asc(draftComments.createdAt));

  return NextResponse.json({ comments: rows });
}

export async function POST(
  req: Request,
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
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const [comment] = await db
    .insert(draftComments)
    .values({
      draftId,
      workspaceId: draft.workspaceId,
      clientId,
      authorType: "client",
      authorName: "Client",
      body: parsed.data.body,
      parentId: parsed.data.parentId,
    })
    .returning();

  return NextResponse.json({ comment }, { status: 201 });
}
