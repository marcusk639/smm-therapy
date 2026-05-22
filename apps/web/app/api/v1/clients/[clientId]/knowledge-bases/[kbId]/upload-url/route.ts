import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, knowledgeBases } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { getPresignedUploadUrl } from "@smm/storage/r2";
import crypto from "node:crypto";
import { z } from "zod";

const UploadUrlSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string(),
});

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
  const parsed = UploadUrlSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );

  const ext = parsed.data.fileName.slice(parsed.data.fileName.lastIndexOf("."));
  const r2Key = `uploads/${workspaceId}/${clientId}/${crypto.randomUUID()}${ext}`;
  const uploadUrl = await getPresignedUploadUrl(r2Key, parsed.data.contentType);

  return NextResponse.json({ uploadUrl, r2Key });
}
