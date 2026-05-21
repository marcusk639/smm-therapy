import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { drafts, llmUsageLog } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { repurposeDraft } from "@smm/ai/agents/repurpose";
import { RepurposeSchema } from "@smm/types/calendar";

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

  const body = (await req.json()) as unknown;
  const parsed = RepurposeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const result = await repurposeDraft(
    draft.hook,
    draft.caption,
    parsed.data.targetFormat,
  );

  await db.insert(llmUsageLog).values({
    workspaceId,
    model: "claude-haiku-4-5-20251001",
    promptTokens: result.usage.inputTokens,
    completionTokens: result.usage.outputTokens,
    cacheReadTokens: result.usage.cacheReadTokens,
    cacheWriteTokens: result.usage.cacheWriteTokens,
    callType: "repurpose",
  });

  const [newDraft] = await db
    .insert(drafts)
    .values({
      workspaceId,
      clientId,
      hook: result.hook,
      caption: result.caption,
      hashtags: result.hashtags,
      format: parsed.data.targetFormat,
      status: "draft",
      complianceApproved: false,
      requiresCrisisResources: false,
    })
    .returning();

  return NextResponse.json({ draft: newDraft }, { status: 201 });
}
