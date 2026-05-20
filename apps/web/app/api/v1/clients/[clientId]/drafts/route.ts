import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, drafts } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
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
      complianceApproved: true,
    })
    .returning();

  return NextResponse.json({ draft }, { status: 201 });
}
