import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace";
import { db } from "@smm/db/client";
import { clients, drafts, calendarJobs } from "@smm/db/schema";
import { workspaceFilter, and, isNull, eq } from "@smm/db/rls";
import { gte, lte } from "drizzle-orm";
import { inngest } from "@smm/inngest/client";
import { GenerateCalendarSchema } from "@smm/types/calendar";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const auth = await requireWorkspace();
  if (auth instanceof NextResponse) return auth;
  const { workspaceId } = auth;
  const { clientId } = await params;

  const { searchParams } = new URL(req.url);
  const month =
    searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
  const [year, mo] = month.split("-").map(Number) as [number, number];
  const start = new Date(year, mo - 1, 1);
  const end = new Date(year, mo, 0, 23, 59, 59);

  const rows = await db
    .select()
    .from(drafts)
    .where(
      and(
        workspaceFilter(drafts.workspaceId, workspaceId),
        eq(drafts.clientId, clientId),
        isNull(drafts.deletedAt),
        gte(drafts.scheduledAt, start),
        lte(drafts.scheduledAt, end),
      ),
    )
    .orderBy(drafts.scheduledAt);

  return NextResponse.json({ drafts: rows });
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
    .select()
    .from(clients)
    .where(
      and(
        workspaceFilter(clients.workspaceId, workspaceId),
        eq(clients.id, clientId),
        isNull(clients.deletedAt),
      ),
    );
  if (!client) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }

  const body = (await req.json()) as unknown;
  const parsed = GenerateCalendarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { month, topicAreas, postsPerWeek } = parsed.data;

  const [job] = await db
    .insert(calendarJobs)
    .values({ workspaceId, clientId, month, topicAreas, postsPerWeek })
    .returning({ id: calendarJobs.id });

  await inngest.send({
    name: "calendar/generate",
    data: {
      jobId: job!.id,
      clientId,
      workspaceId,
      month,
      topicAreas,
      postsPerWeek,
    },
  });

  return NextResponse.json(
    { jobId: job!.id, status: "pending" },
    { status: 202 },
  );
}
