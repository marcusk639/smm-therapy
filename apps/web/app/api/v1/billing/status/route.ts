import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { workspaces, stripeSubscriptions } from "@smm/db/schema";
import { eq } from "drizzle-orm";

export async function GET(_req: Request) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;

  const [workspace] = await db
    .select({ plan: workspaces.plan })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId));

  const [sub] = await db
    .select({ currentPeriodEnd: stripeSubscriptions.currentPeriodEnd })
    .from(stripeSubscriptions)
    .where(eq(stripeSubscriptions.workspaceId, workspaceId));

  return NextResponse.json({
    plan: workspace?.plan ?? "starter",
    hasSubscription: !!sub,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
  });
}
