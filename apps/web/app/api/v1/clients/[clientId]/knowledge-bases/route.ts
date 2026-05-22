import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, knowledgeBases } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { z } from "zod";

const CreateKbSchema = z.object({
  name: z.string().min(1).max(200),
});

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
  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const kbs = await db
    .select()
    .from(knowledgeBases)
    .where(
      and(
        workspaceFilter(knowledgeBases.workspaceId, workspaceId),
        eq(knowledgeBases.clientId, clientId),
      ),
    );

  return NextResponse.json({ knowledgeBases: kbs });
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
  if (!client)
    return NextResponse.json({ error: "Client not found" }, { status: 404 });

  const body = await req.json();
  const parsed = CreateKbSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );

  const [kb] = await db
    .insert(knowledgeBases)
    .values({
      workspaceId,
      clientId,
      name: parsed.data.name,
      kbType: "client",
    })
    .returning();

  return NextResponse.json({ knowledgeBase: kb }, { status: 201 });
}
