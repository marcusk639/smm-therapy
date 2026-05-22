import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { drafts } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { inngest } from "@smm/inngest/client";
import { z } from "zod";

const PublishSchema = z.object({
  imageUrl: z.string().url().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, draftId } = await params;

  const [draft] = await db
    .select()
    .from(drafts)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.id, draftId),
        isNull(drafts.deletedAt),
      ),
    );
  if (!draft) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  if (draft.status !== "approved" && draft.status !== "scheduled") {
    return NextResponse.json(
      { error: "Draft must be approved or scheduled before publishing" },
      { status: 422 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const parsed = PublishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  await inngest.send({
    name: "instagram/publish",
    data: {
      draftId,
      clientId,
      workspaceId,
      imageUrl: parsed.data.imageUrl,
    },
  });

  return NextResponse.json({ ok: true, status: "queued" }, { status: 202 });
}
