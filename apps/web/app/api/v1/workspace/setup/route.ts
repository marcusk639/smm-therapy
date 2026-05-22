import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { workspaces } from "@smm/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

const SetupSchema = z.object({ name: z.string().min(1).max(100) });

export async function POST(req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const body = await req.json();
  const parsed = SetupSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  await db
    .update(workspaces)
    .set({ name: parsed.data.name })
    .where(eq(workspaces.id, workspaceId));

  return NextResponse.json({ ok: true });
}
