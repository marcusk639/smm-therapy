import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, documents } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { inngest } from "@smm/inngest/client";

export async function POST(
  _req: Request,
  {
    params,
  }: { params: Promise<{ clientId: string; kbId: string; docId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, kbId, docId } = await params;

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
  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const [doc] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.knowledgeBaseId, kbId)));
  if (!doc)
    return NextResponse.json({ error: "Document not found" }, { status: 404 });

  await db
    .update(documents)
    .set({
      status: "pending",
      failedStage: null,
      failedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, docId));

  await inngest.send({
    name: "ingestion/document.ingest",
    data: { documentId: docId },
  });

  return NextResponse.json({ ok: true });
}
