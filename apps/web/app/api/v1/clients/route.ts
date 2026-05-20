import { NextResponse } from "next/server";
import { db } from "@smm/db/client";
import { clients } from "@smm/db/schema";
import { workspaceFilter, and, isNull } from "@smm/db/rls";
import { CreateClientSchema } from "@smm/types/client";
import { requireWorkspace } from "@/lib/workspace";

export async function GET() {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const rows = await db
    .select()
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        isNull(clients.deletedAt),
      ),
    )
    .orderBy(clients.createdAt);

  return NextResponse.json({ clients: rows });
}

export async function POST(req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const body = await req.json();
  const parsed = CreateClientSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const [client] = await db
    .insert(clients)
    .values({ workspaceId, ...parsed.data })
    .returning();

  return NextResponse.json({ client }, { status: 201 });
}
