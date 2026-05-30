import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, drafts, llmUsageLog } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { getRulesForClient, runComplianceCritic } from "@smm/compliance/engine";
import { SaveDraftSchema } from "@smm/types/generation";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const [client] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const rows = await db
    .select()
    .from(drafts)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.clientId, clientId),
        isNull(drafts.deletedAt),
      ),
    )
    .orderBy(drafts.createdAt);

  return NextResponse.json({ drafts: rows });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const [client] = await db
    .select()
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = SaveDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const {
    hook,
    caption,
    hashtags,
    format,
    generationAuditId,
    requiresCrisisResources,
  } = parsed.data;

  // Run the compliance critic on the actual saved content. The earlier
  // generation-time critic only saw the as-generated text; if the user
  // edited it before saving, we need to re-check.
  const rules = await getRulesForClient({
    state: client.practiceState ?? "unknown",
    credential: client.primaryCredential ?? "Other",
  });
  const criticResult = await runComplianceCritic(
    `${hook}\n\n${caption}`,
    rules,
  );

  await db.insert(llmUsageLog).values({
    workspaceId,
    model: "claude-haiku-4-5-20251001",
    promptTokens: criticResult.usage.inputTokens,
    completionTokens: criticResult.usage.outputTokens,
    cacheReadTokens: criticResult.usage.cacheReadTokens,
    cacheWriteTokens: criticResult.usage.cacheWriteTokens,
    callType: "compliance_critic",
  });

  const [draft] = await db
    .insert(drafts)
    .values({
      clientId,
      workspaceId,
      hook,
      caption,
      hashtags,
      format: format ?? null,
      generationAuditId: generationAuditId ?? null,
      requiresCrisisResources,
      complianceApproved: criticResult.approved,
    })
    .returning();

  return NextResponse.json(
    {
      draft,
      compliance: {
        violations: criticResult.violations,
        approved: criticResult.approved,
      },
    },
    { status: 201 },
  );
}
