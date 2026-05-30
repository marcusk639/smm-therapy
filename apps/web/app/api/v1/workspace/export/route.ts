import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import {
  clients,
  drafts,
  brandVoices,
  knowledgeBases,
  documents,
} from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";

export async function GET() {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const [
    clientRows,
    draftRows,
    brandVoiceRows,
    knowledgeBaseRows,
    documentRows,
  ] = await Promise.all([
    db
      .select()
      .from(clients)
      .where(
        and(
          workspaceFilter(clients.workspaceId, workspaceId),
          isNull(clients.deletedAt),
        ),
      ),
    db
      .select()
      .from(drafts)
      .where(
        and(
          workspaceFilter(drafts.workspaceId, workspaceId),
          isNull(drafts.deletedAt),
        ),
      ),
    db
      .select()
      .from(brandVoices)
      .where(workspaceFilter(brandVoices.workspaceId, workspaceId)),
    db
      .select()
      .from(knowledgeBases)
      .where(workspaceFilter(knowledgeBases.workspaceId, workspaceId)),
    db
      .select()
      .from(documents)
      .innerJoin(
        knowledgeBases,
        eq(documents.knowledgeBaseId, knowledgeBases.id),
      )
      .where(
        and(
          workspaceFilter(knowledgeBases.workspaceId, workspaceId),
          isNull(documents.deletedAt),
        ),
      ),
  ]);

  const payload = JSON.stringify({
    exportedAt: new Date().toISOString(),
    workspaceId,
    clients: clientRows,
    drafts: draftRows,
    brandVoices: brandVoiceRows,
    knowledgeBases: knowledgeBaseRows,
    documents: documentRows,
  });

  return new NextResponse(payload, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="workspace-export.json"',
    },
  });
}
