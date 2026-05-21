import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { drafts } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { z } from "zod";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { draftId } = await params;

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
  return NextResponse.json({ draft });
}

const PatchDraftSchema = z.object({
  hook: z.string().min(1).optional(),
  caption: z.string().min(1).optional(),
  hashtags: z.array(z.string()).optional(),
  status: z
    .enum([
      "draft",
      "ready_for_client",
      "client_reviewing",
      "approved",
      "changes_requested",
      "scheduled",
      "published",
    ])
    .optional(),
  scheduledAt: z.string().datetime().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ clientId: string; draftId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { draftId } = await params;

  const body = (await req.json()) as unknown;
  const parsed = PatchDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { scheduledAt, ...rest } = parsed.data;
  const update: Record<string, unknown> = { ...rest };
  if (scheduledAt) {
    update.scheduledAt = new Date(scheduledAt);
  }

  const [updated] = await db
    .update(drafts)
    .set(update)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.id, draftId),
        isNull(drafts.deletedAt),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  return NextResponse.json({ draft: updated });
}
