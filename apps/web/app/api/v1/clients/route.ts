import { NextResponse } from "next/server";
import { db } from "@smm/db/client";
import { clients, workspaces } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { count } from "drizzle-orm";
import { CreateClientSchema } from "@smm/types/client";
import { requireWorkspace } from "@/lib/workspace";
import { isWithinClientLimit, clientLimit, type Plan } from "@smm/features";

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

  // Plan-gate the client count. starter=1, growth=5, agency=unlimited.
  const [workspace] = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));
  const plan = (workspace?.plan ?? "starter") as Plan;

  const [{ value: existingCount }] = await db
    .select({ value: count() })
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        isNull(clients.deletedAt),
      ),
    );

  if (!isWithinClientLimit(plan, existingCount)) {
    const limit = clientLimit(plan);
    return NextResponse.json(
      {
        error: `Your ${plan} plan is limited to ${limit} client${limit === 1 ? "" : "s"}. Upgrade to add more.`,
        plan,
        currentCount: existingCount,
        limit,
      },
      { status: 403 },
    );
  }

  const [client] = await db
    .insert(clients)
    .values({ workspaceId, ...parsed.data })
    .returning();

  return NextResponse.json({ client }, { status: 201 });
}
