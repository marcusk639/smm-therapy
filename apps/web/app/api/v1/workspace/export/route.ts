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
import { eq } from "drizzle-orm";

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
    db.select().from(clients).where(eq(clients.workspaceId, workspaceId)),
    db.select().from(drafts).where(eq(drafts.workspaceId, workspaceId)),
    db
      .select()
      .from(brandVoices)
      .where(eq(brandVoices.workspaceId, workspaceId)),
    db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.workspaceId, workspaceId)),
    db
      .select()
      .from(documents)
      .innerJoin(
        knowledgeBases,
        eq(documents.knowledgeBaseId, knowledgeBases.id),
      )
      .where(eq(knowledgeBases.workspaceId, workspaceId)),
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
