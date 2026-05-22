import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, knowledgeBases, documents } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { inngest } from "@smm/inngest/client";
import { z } from "zod";

const StartIngestionSchema = z.object({
  sourceType: z.enum([
    "file_upload",
    "youtube_url",
    "podcast_rss",
    "google_drive",
    "web_url",
    "ig_posts",
  ]),
  title: z.string().min(1).max(500),
  sourceUrl: z.string().url().optional(),
  r2Key: z.string().optional(),
  rawText: z.string().optional(),
  rightsConfirmed: z.literal(true),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ clientId: string; kbId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, kbId } = await params;

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

  const [kb] = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(
      and(
        workspaceFilter(knowledgeBases.workspaceId, workspaceId),
        eq(knowledgeBases.id, kbId),
      ),
    );
  if (!kb)
    return NextResponse.json(
      { error: "Knowledge base not found" },
      { status: 404 },
    );

  const docs = await db
    .select()
    .from(documents)
    .where(
      and(eq(documents.knowledgeBaseId, kbId), isNull(documents.deletedAt)),
    );

  return NextResponse.json({ documents: docs });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string; kbId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId, kbId } = await params;

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

  const [kb] = await db
    .select({ id: knowledgeBases.id })
    .from(knowledgeBases)
    .where(
      and(
        workspaceFilter(knowledgeBases.workspaceId, workspaceId),
        eq(knowledgeBases.id, kbId),
      ),
    );
  if (!kb)
    return NextResponse.json(
      { error: "Knowledge base not found" },
      { status: 404 },
    );

  const body = await req.json();
  const parsed = StartIngestionSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );

  const { sourceType, title, sourceUrl, r2Key, rightsConfirmed } = parsed.data;

  const [doc] = await db
    .insert(documents)
    .values({
      knowledgeBaseId: kbId,
      sourceType,
      title,
      sourceUrl: sourceUrl ?? null,
      r2Key: r2Key ?? null,
      status: "pending",
      rightsConfirmed,
      rightsConfirmedAt: new Date(),
    })
    .returning();

  await inngest.send({
    name: "ingestion/document.ingest",
    data: { documentId: doc!.id },
  });

  return NextResponse.json({ document: doc }, { status: 201 });
}
